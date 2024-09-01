const chatlog = document.getElementById('chat-log');
const chatinput = document.getElementById('chat-input');
const aliasonline = document.getElementById('alias-online');
const roomcode = document.getElementById('hidden-room').getAttribute('roomcode');

const pingInterval = 60000
const timeoutSweep = 2000
const timeoutInterval = pingInterval * 2

var g_nacl = null;
var g_key = null;
var g_ws = null;
const defaultSalt = "systemwidesalt" + roomcode;

var aliases = new Map();

var displayname;
var lastAlias = null;

function alias_joined(alias, timestamp){
    if (aliases.has(alias)) {
        aliases.set(alias, timestamp)
    }
    else {
        aliases.set(alias, timestamp)
        aliasonline.innerHTML += (`<div id="${alias}" class="alias">${alias}</div>`);
        system_message(alias + ' joined');
    }
    
}

function alias_left(alias, message){
    const element = document.getElementById(`${alias}`);
    element.remove();
    aliases.delete(alias);
    system_message(alias + ' ' + message)
}

function timeout_aliases() {
    for (let [alias, timestamp] of aliases) {
        const v = Date.now() - timestamp;
        if (v > timeoutInterval) {
            alias_left(alias, 'timed out')
        }
    }
}

function system_message(txt){
    chatlog.innerHTML += (`<div id="chat-header" class="msg">${txt}</div>`);
}

function append_message(txt, displayname, timestamp){
    if(displayname != lastAlias){
        const options = {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        }
        const displayDate = timestamp.toLocaleString('en-US', options);
        chatlog.innerHTML += (`<div id="chat-header"><div id="header-name">${displayname}  </div><div id="header-timestamp">${displayDate}</div></div>`);
        lastAlias = displayname;
    }
    chatlog.innerHTML += (`<div id="chat-msg" class="msg">${txt}</div>`);
        
}

async function input_handler(e){
    let key=e.keyCode || e.which;
    let max_len = 256;
    if (key==13){
        if (chatinput.value.length > max_len) {
            system_message(`Message exceeds max chars: ${max_len}`);
        } else{
            message_send(chatinput.value);
        }
        chatinput.value = "";
    }
}

function send_json(val){
    plaintext = JSON.stringify(val);

    // encode and then encrypt string with key+nonce
    m = g_nacl.encode_utf8(plaintext);
    n = g_nacl.crypto_secretbox_random_nonce();
    c = g_nacl.crypto_secretbox(m, n, g_key);
    
    // set uint8array output to base64 for ws transfer
    var b64c = base64EncArr(c);
    var b64n = base64EncArr(n);

    // send ciphertext with nonce
    ws.send(JSON.stringify({'ciphertext': b64c, 
        'nonce': b64n}));
}
 
async function message_send(msg){
    send_json({'msg': msg, 'nick':displayname, 'timestamp':Date.now()});
    // scroll to bottom 
    // ok this is a bit hacky we have a race condition with the 
    // message receive which increases the height when we actually 
    // receive the message. Rather than complicating our program 
    // structure by having logic to add the message to log on send
    // we sleep until it bounces back from network. 
    await new Promise(r => setTimeout(r, 300));
    chatlog.scrollTop = chatlog.scrollHeight;
}

async function message_receive(evt, nacl){
    // get list of messages
    data = JSON.parse(evt.data);

    if("messages" in data){
        messages = data.messages;
        for(let i=0; i<messages.length; i++){
            // decode nonce and cipher from base64
            nonce = base64DecToArr(messages[i].nonce);
            cipher = base64DecToArr(messages[i].ciphertext);
            
            try {
                msg_raw = g_nacl.crypto_secretbox_open(cipher,
                    nonce, 
                    g_key);
                msg = JSON.parse(g_nacl.decode_utf8(msg_raw));
                msgTime = new Date(msg.timestamp);
                if('msg' in msg && 'nick' in msg){
                    append_message(msg.msg, msg.nick, msgTime);
                }
                if('joined' in msg && 'nick' in msg){
                    alias_joined(msg.nick, msgTime);
                }
                if('left' in msg && 'nick' in msg){
                    alias_left(msg.nick, 'left room');
                }
                
            } catch(error) {
                system_message("Decryption error");
            }  
        }
        chatlog.scrollTop = chatlog.scrollHeight;
    }
}

function deriveKey(password){
    var L = 32; // key bytes
    var N = 16384; // scrypt difficulty
    var r = 8; // default 'gud' value
    var p = 1; // default 'gud' value
    var password = g_scrypt.encode_utf8(password);
    var salt = g_scrypt.encode_utf8(defaultSalt);
    var keyBytes = g_scrypt.crypto_scrypt(password, salt, N, r, p, L);

    g_key = keyBytes;
}

function clearLog(){
    chatlog.innerHTML = '';
}

function nicknamePrompt(){
    var nick = null;
    while(!nick){
        nick = prompt("Enter a chat alias");
    }
    return nick;
}

function passwordPrompt(){
    var password = null;
    while(!password){
        password = prompt("Enter a password for chat encryption");
    }
    return password;
}

function joined_message(ws){
    send_json({'joined':true, 'nick':displayname, 'timestamp':Date.now()});
} 

function left_message(ws){
    send_json({'left':true, 'nick':displayname, 'timestamp':Date.now()});
}

function start_ws() {
    clearLog();
    console.log("Starting websockets...");
    ws = new WebSocket("ws://" + location.host + "/" + roomcode + "/websocket");
    ws.onopen = function() {
        joined_message(ws);
    };
    ws.onclose = function() {
        left_message(ws);
        window.setTimeout(start_ws, 2000);
    }
    ws.onmessage = message_receive;

    // close ws if tab/window closed
    window.onbeforeunload = ws.onclose;

    // set timeouts and ping join messages 
    window.setInterval(joined_message, pingInterval);
    window.setInterval(timeout_aliases, timeoutSweep);

}

function nacl_ready(nacl){
    console.log("Loading js-nacl...");
    g_nacl = nacl;
    
    scrypt_module_factory(scrypt_ready);
}

function scrypt_ready(scrypt){
    console.log("Loading js-scrypt...");
    g_scrypt = scrypt; 
    displayname = nicknamePrompt();
    const password = passwordPrompt();
    deriveKey(password);
    
    start_ws();
}

nacl_factory.instantiate(nacl_ready);
