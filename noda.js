'use strict';
//подключаем библиотеки
var crypto = require('crypto');
var WebSocket = require("ws");


//получаем порт из командной строки
var p2p_port = +process.argv[2] || 7001;

//список сокетов к другим нодам (и клиенты и сервера)
var sockets = [];

//список блоков
var blockchain = [];


//инициализация подключения к майнеру
var initConnectionMiner = () => {
	console.log('connecting to the miner...');
	let reconnectTimer = null;
	let genTransactionsTimer = null;
	
	//открытие сокета соединения с майнером
	const ws = new WebSocket('ws://127.0.0.1:6001');
	
	//обработчик открытия сокета к майнеру
	//отправка порта майнеру и установка генератора транзакций
	ws.on('open', function open() {
		console.log('connected to the miner');
		write(ws, {type: 'P2P_PORT', data: p2p_port});
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
		}
		//установка таймера транзакций(генерации транзакций)
		genTransactionsTimer = setInterval(() => {
			if (Math.random() < 0.7) {
				initRandomTransaction(ws);
			}
		}, 2000 + Math.random() * 2000);
	});
	//обработчик сообщений
	ws.on('message', function incoming(data) {
		data = JSON.parse(data);
		var type = data.type;
		data = data.data;
		switch (type) {
			case 'INIT_NODE': {
				connectWithPeers(data.peers);
				initBlockChain(data.genesis);
				console.log('set init state from the miner');
				break;
			}
			case 'NEW_BLOCK': {
				console.log('blockchain length = ', blockchain.length);
				addBlock(data);
				//console.log('adding a new block ', data);
				break;
			}
		};

		//console.log('node blockchain', blockchain);
	});
	
	//обработчик ошибок
	ws.on('error', function() {
		console.log('connection error');
		
	});
	//обработчик закрытия соединения
	ws.on('close', function() {
		console.log('connection closed');
		reconnect();
	});
	//попытка перезапуска соединения майнера
	function reconnect() {
		reconnectTimer = setTimeout(() => {
			initConnectionMiner();
		}, 10000);
		if (genTransactionsTimer) {
			clearInterval(genTransactionsTimer);
		};
	};
	
};
//запуск сервера ноды
var initP2PServer = () => {
	var server = new WebSocket.Server({port: p2p_port});
	server.on('connection', ws => initConnection(ws, true));
	console.log('listening websocket p2p port on: ' + p2p_port);
};
//запуск клиента ноды
var initP2PClient = (peer) => {
	var client = new WebSocket('ws://' + peer);
	client.on('open', () => initConnection(client));
	console.log('connecting to peer: ' + peer);
};


//функция соединения с другими нодами для синхронизации
var connectWithPeers = (peers) => {
	peers.forEach(peer => {
		initP2PClient(peer);
	});
};


//обработчик подключения другой ноды, отправляет ей свой блокчейн
var initConnection = (ws, srv = false) => {
	sockets.push(ws);
	initMessageHandler(ws);
	initErrorHandler(ws);
	console.log('new connection from other peer (noda)');
	if (srv) {
		//console.log('Server sending SET_CHAIN');
		write(ws, {type: 'SET_CHAIN', data: blockchain});
	}
};
//обработчик получения сообщения
var initMessageHandler = (ws) => {
	ws.on('message', (data) => {
		data = JSON.parse(data);
		var type = data.type;
		data = data.data;
		switch (type) {
			case 'SET_CHAIN': {
				console.log('SET_CHAIN');
				if (blockchain.length < data.length && isValidNewBlockChain(data)) {
					console.log('------------------------------blockchain replaced', blockchain.length, data.length, blockchain.map(block => block.index));
					blockchain = data;	
				}
				break;
			}
			case 'GET_CHAIN': {
				console.log('GET_CHAIN');
				write(ws, {
					type: 'SET_CHAIN',
					data: blockchain
				});
		
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

//вычисление хэша для блока
var calculateHashForBlock = (block) => {
	return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};
//вычисление хэша по данным
var calculateHash = (index, previousHash, timestamp, data) => {
	return crypto.createHash("sha256").update(index + previousHash + timestamp + data).digest('hex');
};
//добавление блока в блокчейн
var addBlock = (newBlock) => {
	if (isValidNewBlock(newBlock, getLatestBlock())) {
		blockchain.push(newBlock);
	}
};
//проверка валидности блокчейна (полученного от другой ноды)
var isValidNewBlockChain = (blockchain) => {
	if (blockchain.length <= 1) return false;
	let previousBlock, block;
	
	for (let i = 1; i < blockchain.length; i++) {
		previousBlock = blockchain[i - 1];
		block = blockchain[i];
		if (!isValidNewBlock(block, previousBlock)) return false;
	}
	
	return true;
};

//проверка валидности нового блока
var isValidNewBlock = (newBlock, previousBlock) => {
	if (previousBlock.index + 1 !== newBlock.index) {
		console.log('invalid index: ', newBlock.index);
		return false;
	} else if (previousBlock.hash !== newBlock.previousHash) {
		console.log('invalid previoushash');
		return false;
	} else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
		console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
		console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
		return false;

	} else if (newBlock.data.hash != calculateHashForTransaction(newBlock.data.text, newBlock.data.source)) {
		console.log('Hash is incorrect');
		return false;
	}

	return true;
};


//вычисление хэша транзакций
var calculateHashForTransaction = (text, source) => {
	return crypto.createHash("sha256").update(text + source).digest('hex');
};

//создание случайных транзакций и отправка их майнеру
var initRandomTransaction = (ws) => {
	var list = ["My good transaction", "Money transfer", "Buying a toy", "Buying a laptop", "Donation"];
	var text = list[parseInt(Math.random() * list.length)];
	write(ws, {
		type: 'CREATE_BLOCK',
		data: {
			text: text,
			source: p2p_port,  // стоит добавить ip
			hash: calculateHashForTransaction(text, p2p_port)
		},
		previousBlock: getLatestBlock()
	});
}

//синхронизация нод(запрос другим нодам про их блокчейн)
var getBlockchainsFromOtherNodes = () => {
	setInterval(() => {
		console.log('Отправляем GET_CHAIN');
		broadcast ({
			type: 'GET_CHAIN'
		});
	},3000);
};

//функция разрушения цепочки, эмулирует ошибки в ноде или умышленную подмену блокчейна
function breakBlockchain(possibility, frequency) {
	setInterval(() => {
		//console.log(sockets.length);
		if (Math.random() < possibility) {
			blockchain = blockchain.slice(0, 1 + Math.floor(Math.random() * Math.min(parseInt(blockchain.length / 2), 0)));
			console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>reset blockchain');
		}
	}, frequency);
}

//отправить данные в один сокет
var write = (ws, message) => ws.send(JSON.stringify(message));

//отправить данные всем
var broadcast = (message) => sockets.forEach(socket => write(socket, message));


//получить последний блок
var getLatestBlock = () => blockchain[blockchain.length - 1];

//инициализация блокчейна базовым блоком
var initBlockChain = (block) => {
	if (!blockchain.length) blockchain.push(block);
}



initP2PServer();
initConnectionMiner();
getBlockchainsFromOtherNodes();
breakBlockchain(0.05, 1000);






