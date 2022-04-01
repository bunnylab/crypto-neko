import tornado.ioloop
import tornado.web
import tornado.websocket
from tornado.escape import json_decode
import os, string, random

MAX_ROOMS = 50
BUFFER_SIZE = 100
DEFAULT_PORT = 3000
MAX_CT = 512
DEFAULT_NICK = "Alice"
DEFAULT_PING_INTERVAL = 10

class MessagingBuffer:
    
    def __init__(self):
        self.limit = BUFFER_SIZE
        self.message_buffer = [None for i in range(self.limit)]
        self.index = 0
        self.current = 0

    def _ordered_yield(self):
        for i in range(self.limit):
            x = (self.index + i) % self.limit
            if self.message_buffer[x]:
                yield self.message_buffer[x]

    def push(self, msg):
        self.message_buffer[self.index] = msg 
        self.index = (self.index + 1) % self.limit
        self.current += 1

    def get_all(self):
        return list(self._ordered_yield())

class RoomQueue:

    def __init__(self):
        self.current = 0
        self.map = {}
        self.rooms = []
        for i in range(MAX_ROOMS):
            self.rooms.append( None )

    def room_code(self):
        return ''.join(random.choice(string.ascii_letters) for x in range(5))

    def new_room(self):
        
        self.rooms[self.current] = MessagingBuffer()
        for key, index in self.map.items():
            if self.current == index:
                self.map.pop(key)
                break
        
        code = self.room_code()
        self.map[code] = self.current
        self.current = (self.current + 1) % MAX_ROOMS
     
        return code

    def room_index(self, code):
        return self.map.get(code, None)

rq = RoomQueue()

class MainHandler(tornado.web.RequestHandler):
   
    def get(self):
        code = rq.new_room()
        self.redirect(f"%s" % (code,) )

class RoomHandler(tornado.web.RequestHandler):

    def get(self, code):
        nick = self.get_argument("nick", DEFAULT_NICK)
        index = rq.room_index(code)
        if index == None:
            raise tornado.web.HTTPError(
                status_code=404,
                reason="Room Not Found, nya"
            )

        self.render("index.html", name=nick, room=code)
            

class EchoWebSocket(tornado.websocket.WebSocketHandler):
    rooms = {}

    def check_origin(self, origin):
        return True

    @classmethod 
    def broadcast(cls, code, msg):
        for client in cls.rooms.get(code, []):
            try:
                client.write_message(msg)
            except:
                print("error sending message")

    def on_message(self, message):
        msg = json_decode(message)
        buffer = rq.rooms[rq.room_index(self._code)]
        
        if len(msg.get('ciphertext')) < MAX_CT:
            buffer.push(msg)
            EchoWebSocket.broadcast(self._code, {"messages": [msg]} )
        else:
            pass
    
    def open(self, code):
        self._code = code

        if not EchoWebSocket.rooms.get(code):
            EchoWebSocket.rooms[code] = set()
        EchoWebSocket.rooms.get(code).add(self)

        
        buffer =  rq.rooms[rq.room_index(code)]
        self.write_message({'messages':buffer.get_all()})

    def on_close(self):
        EchoWebSocket.rooms.get(self._code).remove(self)

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
    app.listen(DEFAULT_PORT)
    tornado.ioloop.IOLoop.current().start()