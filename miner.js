'use strict';
//подключаем библиотеки
var crypto = require('crypto');
var WebSocket = require("ws");

//получаем порт из командной строки
var p2p_port = +process.argv[2] || 6001;

//создаем класс блок
class Block {
	constructor(index,previousHash, timestamp, data, hash) {
		this.index = index;
		this.previousHash = previousHash.toString();
		this.timestamp = timestamp;
		this.data = data;
		this.hash = hash.toString();
	}
}
//создаем массив подключений
var sockets = [];


//Создаем первый(генезис) блок
var getGenesisBlock = () => {
	return new Block(0, "0", 1465154705, "my genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
	
};


//определяем функцию инициализации сервера веб-сокетов
var initP2PServer = () => {
	var server = new WebSocket.Server({port: p2p_port});
	server.on('connection', ws => initConnection(ws));
	console.log('listening websocket p2p port on: ' + p2p_port);
};

//определяем функцию инициализации соединения
var initConnection = (ws) => {
	sockets.push(ws);
	initMessageHandler(ws);
	initErrorHandler(ws);
	console.log('connection = ', getPeerServerAddresses());
	/*
		При соединении от ноды майнер отправляет генезис блок и 
		адреса серверов других нод. Нода при получении устанавливает 
		себе цепь из базового блока и подключается к другим нодам.
		При подключении те отдают свою цепь и если эта цепь валидна 
		и длиннее текущей, то происходит замена.
	*/
	write(ws, {
		type: 'INIT_NODE', 
		data: {
			peers: getPeerServerAddresses(),
			genesis: getGenesisBlock()
		}
	});

};

//обработчик сообщений
var initMessageHandler = (ws) => {
	ws.on('message', (data) => {
		var message = JSON.parse(data);
		console.log('Received message ' + data);
		switch (message.type) {
			case 'P2P_PORT': {
				//получение порта сервера сокетов ноды
				//peers.push(getPeerServerAddress(ws, message.data));
				ws.serverPort = message.data;
				console.log('peers =', getPeerServerAddresses());
				break;
			}
			case 'CREATE_BLOCK': {
				//обработка запроса создания нового блока по данным полученным от ноды (транзакционной данные и предыдущий блок)
				var newBlock = generateNextBlock(message.data, message.previousBlock);
				broadcast({type: 'NEW_BLOCK', data: newBlock});
				console.log('Created a new block: ', newBlock);
				break;
			}
		};
	});
};

//обработчик ошибок
var initErrorHandler = (ws) => {
	var closeConnection = (ws) => {
		sockets.splice(sockets.indexOf(ws), 1);
	};
	ws.on('close', () => closeConnection(ws));
	ws.on('error', () => closeConnection(ws));
};

//генерация следующего блока на основе данных о транзакции и предыдущего блока
var generateNextBlock = (blockData, previousBlock) => {
	if (Math.random() < 0.1) {
		blockData.text += 'break';
		console.log('++++++++++++++++++++++break');
	}
	var nextIndex = previousBlock.index + 1;
	var nextTimestamp = Date.now()/1000;
	var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
	return new Block(nextIndex, previousBlock.hash, nextTimestamp,blockData, nextHash);
};

//вычисление хэша для блока
var calculateHashForBlock = (block) => {
	return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

//вычисление хэша по данным
var calculateHash = (index, previousHash, timestamp, data) => {
	return crypto.createHash("sha256").update(index + previousHash + timestamp + data).digest('hex');
};

//отправить данные в один сокет
var write = (ws, message) => ws.send(JSON.stringify(message));

//отправить данные всем
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

//по данному сокету ноды: майнер получает адрес и порт ee сервера 
var getPeerServerAddress = (ws) => {
	return ws._socket.remoteAddress + ':' + ws.serverPort;
};
//майнер получает список адресов серверов нод
var getPeerServerAddresses = () => {
	return sockets.filter(s => s.serverPort).map(s => getPeerServerAddress(s));
};

initP2PServer();







