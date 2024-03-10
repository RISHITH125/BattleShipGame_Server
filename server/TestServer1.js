
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
      gameStarted:  false,
    };
    user.roomId = roomId;
    console.log(`${user.username} created room ${roomId}`);

    //telling the user 1 to wait for the second player to join
    connections[uuid].send(JSON.stringify({ action: "Waiting for the player2", RoomId : user.roomId}));
    console.log(user.username)
    console.log(JSON.stringify({ action: "Waiting for the player2"}))
  } 
  else if (message.action === "join room") {
    const roomId = message.roomId;
    const room = rooms[roomId];
    if (room && room.clients.length <  2) {
      room.clients.push(uuid);
      user.roomId = roomId;
      console.log(`${user.username} joined room ${roomId}`);


      const otherPlayerUuid = room.clients.find((clientUuid)=>clientUuid != uuid);
      const otherPlayer = users[otherPlayerUuid]

      connections[uuid].send(JSON.stringify({ action: "JoinedRoom"}));
      connections[otherPlayerUuid].send(JSON.stringify({ action: "JoinedRoom"}));

      setTimeout(() => {
        connections[uuid].send(JSON.stringify({ action: "BroadCastName", player1:user.username, player2:otherPlayer.username})); // 2nd player
        connections[otherPlayerUuid].send(JSON.stringify({ action: "BroadCastName" , player1:otherPlayer.username , player2:user.username }));// 1st player
  
        // starting the game
        connections[uuid].send(JSON.stringify({ action: "SelectShips"})); // 2nd player
        connections[otherPlayerUuid].send(JSON.stringify({ action: "SelectShips"}));// 1st player
      }, 50);
    } 
    else {
      console.log(`Room ${roomId} is full or does not exist`);
    }
  }
  if (message.action === "ShipsSelectionComplete") {
    const room = rooms[users[uuid].roomId];

    const selectedShips = message.selectedShips; // assuming the client sends the array of selected ships with the key 'selectedShips'
    if (Array.isArray(selectedShips)) {
      users[uuid].MyShips = selectedShips;
      console.log(`${users[uuid].username}'s ships have been set.`);
      
      // Check if both users in the room have set their ships
      
      if (room && room.clients.every(clientUuid => Array.isArray(users[clientUuid].MyShips) && users[clientUuid].MyShips.length > 0)) {
        // If they have, send a message to the room creator that it's their turn
        const roomCreatorUuid = room.owner;
        const player2uuid = room.clients.find((clientUuid) => clientUuid !== uuid);
        const player2Connection = connections[player2uuid];
        if (!users[roomCreatorUuid].Myturn) { // Check if the turn has already been set
          users[roomCreatorUuid].Myturn = true;
          connections[roomCreatorUuid].send(JSON.stringify({ action: "Let the game begin"}));
          connections[roomCreatorUuid].send(JSON.stringify({ action: "My turn", turn:users[roomCreatorUuid].Myturn}));
          // player2Connection.send(JSON.stringify({ action: "Let the game begin"}));
       
          if (player2uuid !== roomCreatorUuid) { // Check if player2 is not the owner
            player2Connection.send(JSON.stringify({ action: "Let the game begin"}));
            player2Connection.send(JSON.stringify({action:"Opponent turn"}));
          }
          else if(uuid !== roomCreatorUuid) {
            connections[uuid].send(JSON.stringify({ action: "Let the game begin"}));
            connections[uuid].send(JSON.stringify({action:"Opponent turn"}));
      
          }
        }
      }
    } 
    else {
      console.log(`Invalid data received for setting ships for user ${users[uuid].username}`);
    }
  }
  if (message.action === "turn complete") { 
    const room = rooms[user.roomId];
    const player2uuid = room.clients.find((clientUuid) => clientUuid !== uuid);
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
  user.Myturn = false;
  user.turns += 1; // Increment the turns property
  if (user.turns >= 7) {
    // If the user has taken 7 turns, end the game
    const room = rooms[user.roomId];
    const player2uuid = room.clients.find((clientUuid) => clientUuid !== uuid);
    const player2 = users[player2uuid];
    let winner;
    if (user.DestroyedShip.length > player2.DestroyedShip.length) {
      winner = user.username;
    } else if (user.DestroyedShip.length < player2.DestroyedShip.length) {
      winner = player2.username;
    } else {
      winner = "It's a tie";
    }
    // Send a message to both players with the result
    connections[uuid].send(JSON.stringify({ action: "Game over", whowin:winner }));
    connections[player2uuid].send(JSON.stringify({ action: "Game over", whowin:winner }));
  } else {
    // If the game is not over, it's the other player's turn
    player2.Myturn = true;
    connections[uuid].send(JSON.stringify({action:"Opponent turn"}));
    player2Connection.send(JSON.stringify({action:"My turn",turn:player2.Myturn}));
  }
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
    } else {
      // If there's another player in the room, send them a message that the game is over and they are the winner
      const otherPlayerUuid = room.clients[0];
      connections[otherPlayerUuid].send(JSON.stringify({ action: "Game over", whowin: users[otherPlayerUuid].username }));
    }
  }
  console.log(`${user.username} disconnected`);
  delete connections[uuid];
  delete users[uuid];

  if (room && room.clients.length >  0) {
    broadcast(roomId);
  }
};

const broadcast = (roomId) => {
  const room = rooms[roomId];
  if (room) {
    room.clients.forEach((uuid) => {
        const connection = connections[uuid];
        const message = JSON.stringify(users[uuid].state);
        connection.send(message);
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
    turns:0,
  };
  connection.on("message", (message) => handleMessage(message, uuid));
  connection.on("close", () => handleClose(uuid));
});

server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
