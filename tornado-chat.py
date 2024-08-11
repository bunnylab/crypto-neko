import tornado.ioloop
import tornado.web
import tornado.websocket
from tornado.escape import json_decode
import os, string, random, json

MAX_ROOMS = 50
BUFFER_SIZE = 100
DEFAULT_PORT = 3000
MAX_CT = 512
DEFAULT_NICK = "Alice"
DEFAULT_PING_INTERVAL = 10
LOG_DIRECTORY = "/tmp/cryptoneko"


class MessagingBuffer:
    
    def __init__(self, code=None):
        self.limit = BUFFER_SIZE
        self.message_buffer = [None for i in range(self.limit)]
        self.index = 0
        self.current = 0

        # here is where we will try to just add in a file system 
        self.log_file = f"{code}.log"

        with open(self.log_file, "w") as writeit:
            pass 


    def _ordered_yield(self):
        for i in range(self.limit):
            x = (self.index + i) % self.limit
            if self.message_buffer[x]:
                yield self.message_buffer[x]

    def push(self, msg):
        # self.message_buffer[self.index] = msg 
        # self.index = (self.index + 1) % self.limit
        # self.current += 1
        with open(self.log_file, "a") as log:
            print(msg)
            log.write(json.dumps(msg) + "\n")

    def get_all(self):
        #return list(self._ordered_yield())
        with open(self.log_file, "r") as log:
            raw = log.readlines()
            print("debug this!")
            print(raw)
            return [json.loads(x) for x in raw]

class RoomQueue:

    def __init__(self):
        self.current = 0
        self.map = {}
        self.rooms = []
        # for i in range(MAX_ROOMS):
        #     self.rooms.append( None )

        # refactor all this crap to not use the arrays and other structures 
        # I think all we really need here is a dictionary of the current rooms 
        # so we put the code as the key and then add the buffer as the content 
        # and we don't need anything else 
        # lets see if we can use linux log rotation utilities to handle the chat 
        # logs and manage the number of files
        if not os.path.exists(LOG_DIRECTORY):
            os.makedirs(directory)
        log_files = os.listdir(LOG_DIRECTORY)
        for f in log_files:
            print(f)
            if f.endswith(".log")
            self.rooms.append()

    def room_code(self):
        return ''.join(random.choice(string.ascii_letters) for x in range(5))

    def new_room(self):
        
        code = self.room_code()
        self.rooms[self.current] = MessagingBuffer(code=code)
        for key, index in self.map.items():
            if self.current == index:
                self.map.pop(key)
                break
        
        
        self.map[code] = self.current
        self.current = (self.current + 1) % MAX_ROOMS
     
        return code

    def room_index(self, code):
        return self.map.get(code, None)


class MainHandler(tornado.web.RequestHandler):
   
    def get(self):
        code = self.application.room_queue.new_room()
        self.redirect(f"%s" % (code,) )

class RoomHandler(tornado.web.RequestHandler):

    def get(self, code):
        nick = self.get_argument("nick", DEFAULT_NICK)
        index = self.application.room_queue.room_index(code)
        if index == None:
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
        buffer = self.application.room_queue.rooms[self.application.room_queue.room_index(self._code)]
            
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

        buffer =  self.application.room_queue.rooms[self.application.room_queue.room_index(code)]
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