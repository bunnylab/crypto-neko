const chatlog = document.getElementById('chat-log');
const chatinput = document.getElementById('chat-input');
const displayname = document.getElementById('hidden-name').getAttribute('displayname');
const roomcode = document.getElementById('hidden-room').getAttribute('roomcode');

var g_nacl = null;
var g_key = null;
var g_ws = null;
const defaultSalt = "insertdefaultsalthere";

function append_message(txt, displayname){
    chatlog.value += (`${displayname}: ${txt}\n`);
}

async function input_handler(e){
    let key=e.keyCode || e.which;
    let max_len = 256;
    if (key==13){
        if (chatinput.value.length > max_len) {
            append_message(`Message exceeds max chars: ${max_len}`, "System");
        } else{
            message_send(chatinput.value);
        }
        chatinput.value = "";
    }
}

function message_send(msg){
    plaintext = JSON.stringify({'msg': msg, 'nick':displayname})
    
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

    // scroll to bottom 
    chatlog.scrollTop = chatlog.scrollHeight;
}

function message_receive(evt, nacl){
    // get list of messages
    data = JSON.parse(evt.data);
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
            append_message(msg.msg, msg.nick);
        } catch(error) {
            append_message("Decryption error", "System");
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

function passwordPrompt(){
    const password = prompt("Enter a password for chat encryption");
    return password;
}

function start_ws() {
    console.log("Starting websockets...");
    ws = new WebSocket("ws://" + location.host + "/" + roomcode + "/websocket");
    ws.onopen = function() {
    };
    ws.onmessage = message_receive;

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
    const password = passwordPrompt();
    deriveKey(password);
    
    start_ws();
}

nacl_factory.instantiate(nacl_ready);
