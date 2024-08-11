import tornado.ioloop
import tornado.web
import tornado.websocket
from tornado.escape import json_decode
import os, string, random, json

BUFFER_SIZE = 100
DEFAULT_PORT = 3000
MAX_CT = 512
DEFAULT_NICK = "Alice"
DEFAULT_PING_INTERVAL = 10
LOG_DIRECTORY = "/tmp/cryptoneko"


class MessagingBuffer:
    
    def __init__(self, code=None):
        self.code = code 
        self.log_file = f"{LOG_DIRECTORY}/{code}.log"

        with open(f"{LOG_DIRECTORY}/{code}.log", "a"):
            pass 

    def push(self, msg):
        with open(self.log_file, "a") as log:
            log.write(json.dumps(msg) + "\n")

    def get_all(self):
        with open(self.log_file, "r") as log:
            raw = log.readlines()
            return [json.loads(x) for x in raw]

class RoomQueue:

    def __init__(self):
        self.rooms = {}

        if not os.path.exists(LOG_DIRECTORY):
            os.makedirs(LOG_DIRECTORY)
        log_files = os.listdir(LOG_DIRECTORY)
        for f in log_files:
            if f.endswith(".log"):
                code = f[:-4]
                self.rooms[code] = MessagingBuffer(code)

    def room_code(self):
        return ''.join(random.choice(string.ascii_letters) for x in range(5))

    def new_room(self):
        
        code = self.room_code()
        self.rooms[code] = MessagingBuffer(code=code)
     
        return code


class MainHandler(tornado.web.RequestHandler):
   
    def get(self):
        code = self.application.room_queue.new_room()
        self.redirect(f"%s" % (code,) )

class RoomHandler(tornado.web.RequestHandler):

    def get(self, code):
        nick = self.get_argument("nick", DEFAULT_NICK)
        room = self.application.room_queue.rooms[code]
        if room == None:
            raise tornado.web.HTTPError(
                status_code=404,
                reason="Room Not Found, nya"
            )

        self.render("index.html", name=nick, room=code)
            

class EchoWebSocket(tornado.websocket.WebSocketHandler):

    def check_origin(self, origin):
        return True

    def broadcast(self, code, msg):
        for sock in self.application.room_set.get(code, []):
            try:
                sock.write_message(msg)
            except:
                print("error sending message")

    def on_message(self, message):
        msg = json_decode(message)
        buffer = self.application.room_queue.rooms[self._code]
            
        if 'ciphertext' in msg and len(msg.get('ciphertext')) < MAX_CT:
            buffer.push(msg)
            self.broadcast(self._code, {"messages": [msg]} )
        else:
            pass
    
    def open(self, code):
        self._code = code

        if not self.application.room_set.get(code):
            self.application.room_set[code] = set()
        self.application.room_set.get(code).add(self)

        buffer =  self.application.room_queue.rooms[code]
        self.write_message({'messages':buffer.get_all()})


    def on_close(self):
        self.application.room_set.get(self._code).remove(self)

def make_app():
    settings = {
        "websocket_ping_interval": DEFAULT_PING_INTERVAL,
        "static_path": os.path.join(os.path.dirname(__file__), "static"),
        "template_path": os.path.join(os.path.dirname(__file__), "templates"),
    }

    return tornado.web.Application([
        (r"/", MainHandler),
        (r"/([a-zA-Z]+)", RoomHandler),
        (r"/([a-zA-Z]+)/websocket", EchoWebSocket),
    ], **settings)

if __name__ == "__main__":
    app = make_app()
    app.room_queue = RoomQueue()
    app.room_set = {}
    app.listen(DEFAULT_PORT)
    tornado.ioloop.IOLoop.current().start()