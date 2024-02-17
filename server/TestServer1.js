
//TASK REMINDER !!!!!  :-  Pass an error msg to the client whenever required (NOT COMPLETED)


const { WebSocketServer } = require("ws");
const http = require("http");
const uuidv4 = require("uuid").v4;
const url = require("url");

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

const port =  4748;
const connections = {};
const users = {};
const rooms = {};

const generateRoomId = () => {
  let roomId;
  do {
    roomId = Math.floor(100000 + Math.random() *  900000);
  } while (rooms[roomId]);
  return roomId;
};

const handleMessage = (bytes, uuid) => {
  const message = JSON.parse(bytes.toString());
  const user = users[uuid];
  console.log(user);

  if (message.action === "create room") {
    const roomId = generateRoomId();
    rooms[roomId] = {
      owner: uuid,
      clients: [uuid],
    };
    user.roomId = roomId;
    console.log(`${user.username} created room ${roomId}`);

    //telling the user 1 to wait for the second player to join
    connections[uuid].send(JSON.stringify({ action: "Waiting for the player2"}));
  } 
  else if (message.action === "join room") {
    const roomId = message.roomId;
    const room = rooms[roomId];
    if (room && room.clients.length <  2) {
      room.clients.push(uuid);
      user.roomId = roomId;
      console.log(`${user.username} joined room ${roomId}`);
      connections[uuid].send(JSON.stringify({ action: "JoinedRoom"}));

      connections[uuid].send(JSON.stringify({ action: "BroadCastName", player1:user.username, player2:otherPlayer.username})); // 2nd player
      connections[otherPlayerUuid].send(JSON.stringify({ action: "BroadCastName" , player1:otherPlayer.username , player2:user.username }));// 1st player

      const room= rooms[user.roomId];
      const otherPlayerUuid = room.clients.find((clientUuid)=>clientUuid != uuid);
      const otherPlayer = users[otherPlayerUuid]
      // starting the game
      connections[uuid].send(JSON.stringify({ action: "SelectShips"})); // 2nd player
      connections[otherPlayerUuid].send(JSON.stringify({ action: "SelectShips"}));// 1st player
    } else {
      console.log(`Room ${roomId} is full or does not exist`);
    }
  }
  if (message.action === "check index") {
    const room = rooms[user.roomId];
    const player2uuid = room.clients.find((clientUuid) => clientUuid != uuid);
    const player2 = users[player2uuid];
    const indexExists = player2.MyShips.includes(message.SelectedShip);
    if (indexExists) {
      user.DestroyedShip.push(message.SelectedShip);
      player2.MyHealth -=   1;
      const player2Connection = connections[player2uuid];
      player2Connection.send(JSON.stringify({ action: "health update", health: player2.MyHealth }));
      connections[uuid].send(JSON.stringify({ action: "index check", exists: true }));
    } else {
      connections[uuid].send(JSON.stringify({ action: "index check", exists: false }));
    }
    user.SelectedShip=null
  }

  if (message.action === "turn complete") {
    const room = rooms[user.roomId];
    const player2uuid = room.clients.find((clientUuid) => clientUuid !== uuid);
    const player2 = users[player2uuid];
    user.Myturn=false
    player2.Myturn = true;
    const player2Connection = connections[player2uuid];
    player2Connection.send(JSON.stringify({action:"My turn",turn:player2.Myturn}))
    connections[uuid].send(JSON.stringify({action:"PlayerOneTurnComplete",turn:user.Myturn}))
  }
};

const handleClose = (uuid) => {
  const user = users[uuid];
  const roomId = user.roomId;
  const room = rooms[roomId];

  if (room) {
    room.clients = room.clients.filter((clientUuid) => clientUuid !== uuid);
    if (room.clients.length ===  0) {
      delete rooms[roomId];
    }
  }

  console.log(`${user.username} disconnected`);
  delete connections[uuid];
  delete users[uuid];

  if (room && room.clients.length >  0) {
    broadcast(roomId);
  }
};

const broadcast = (roomId, excludeUuid) => {
  const room = rooms[roomId];
  if (room) {
    room.clients.forEach((uuid) => {
      if (uuid !== excludeUuid) {
        const connection = connections[uuid];
        const message = JSON.stringify(users[uuid].state);
        connection.send(message);
      }
    });
  }
};

wsServer.on("connection", (connection, request) => {
  const { username } = url.parse(request.url, true).query;
  console.log(`${username} connected`);
  const uuid = uuidv4();
  connections[uuid] = connection;
  users[uuid] = {
    username,
    MyShips: [],
    SelectedShip: null,
    DestroyedShip: [],
    MyHealth:  7,
    Myturn: false,
  };
  connection.on("message", (message) => handleMessage(message, uuid));
  connection.on("close", () => handleClose(uuid));
});

server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
