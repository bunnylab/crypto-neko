const chatlog = document.getElementById('chat-log');
const chatinput = document.getElementById('chat-input');
const aliasonline = document.getElementById('alias-online');

//const displayname = document.getElementById('hidden-name').getAttribute('displayname');
const roomcode = document.getElementById('hidden-room').getAttribute('roomcode');

var g_nacl = null;
var g_key = null;
var g_ws = null;
const defaultSalt = "insertdefaultsalthere";

var displayname;
var lastAlias = null;

function alias_joined(alias){
    aliasonline.innerHTML += (`<div id="${alias}" class="alias">${alias}</div>`);
    system_message(alias + ' joined');
}

function alias_left(alias){
    const element = document.getElementById(`${alias}`);
    element.remove();
    system_message(alias + ' left')
}

function system_message(txt){
    chatlog.innerHTML += (`<div id="chat-header" class="msg">${txt}</div>`);
}

function append_message(txt, displayname){
    if(displayname != lastAlias){
        const options = {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        }
        const timestamp = new Date().toLocaleString('en-US', options);
        chatlog.innerHTML += (`<div id="chat-header"><div id="header-name">${displayname}  </div><div id="header-timestamp">${timestamp}</div></div>`);
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
    send_json({'msg': msg, 'nick':displayname});
    // scroll to bottom 
    // ok this is a bit hacky we have a race condition with the 
    // message receive which increases the height when we actually 
    // receive the message. Rather than complicating our program 
    // structure by having logic to add the message to log on send
    // we sleep until it bounces back from network. 
    await new Promise(r => setTimeout(r, 300));
    chatlog.scrollTop = chatlog.scrollHeight;
}

function message_receive(evt, nacl){
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
                console.log(msg);
                if('msg' in msg && 'nick' in msg){
                    append_message(msg.msg, msg.nick);
                }
                if('joined' in msg && 'nick' in msg){
                    alias_joined(msg.nick);
                }
                if('left' in msg && 'nick' in msg){
                    alias_left(msg.nick);
                }
                
            } catch(error) {
                system_message("Decryption error");
            }  
        }
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

    //g_key = g_nacl.random_bytes(32);
    g_key = keyBytes;
}

function clearLog(){
    chatlog.value = '';
}

function nicknamePrompt(){
    const nick = prompt("Enter an alias for chat");
    return nick;
}

function passwordPrompt(){
    const password = prompt("Enter a password for chat encryption");
    return password;
}

function joined_message(ws){
    send_json({'joined':true, 'nick':displayname});
}

function left_message(ws){
    send_json({'left':true, 'nick':displayname});
}

function start_ws() {
    console.log("Starting websockets...");
    ws = new WebSocket("ws://" + location.host + "/" + roomcode + "/websocket");
    ws.onopen = function() {
        joined_message(ws);
    };
    ws.onclose = function() {
        left_message(ws);
        alert("Connection Closed. Refresh Page, nya.");
    }
    ws.onmessage = message_receive;

    // close ws if tab/window closed
    window.onbeforeunload = ws.onclose;

    clearLog();
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
