const { WebSocketServer } = require("ws");
const http = require("http");
const uuidv4 = require("uuid").v4;
const url = require("url");

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

const port =  8000;
const connections = {};
const users = {};
const rooms = {}; // New object to track rooms

// Function to generate a  6-digit random room ID
const generateRoomId = () => {
  let roomId;
  do {
    roomId = Math.floor(100000 + Math.random() *  900000); // Generate a  6-digit number
  } while (rooms[roomId]); // Check if the room ID is already in use
  return roomId;
};

const handleMessage = (bytes, uuid) => {
  const message = JSON.parse(bytes.toString());
  const user = users[uuid];
    // const user = message.user
  console.log(user)  
  if (message.action === "create room") {
    // Create a new room and assign the user as the owner
    const roomId = generateRoomId(); // Generate a unique room ID
    rooms[roomId] = {
      owner: uuid,
      clients: [uuid],
    };
    user.roomId = roomId; // Store the room ID in the user object
    console.log(`${user.username} created room ${roomId}`);
  } else if (message.action === "join room") {
    // Add the user to an existing room
    const roomId = message.roomId;
    const room = rooms[roomId];
    if (room && room.clients.length <  2) {
      room.clients.push(uuid);
      user.roomId = roomId; // Store the room ID in the user object
      console.log(`${user.username} joined room ${roomId}`);
    } else {
      console.log(`Room ${roomId} is full or does not exist`);
    }
  } else {
    // Handle other messages
    user.state = message;
    broadcast(user.roomId); // Broadcast only to the same room

    console.log(
      `${user.username} updated their state: ${JSON.stringify(user.state)}`
    );
  }
};

const handleClose = (uuid) => {
  const user = users[uuid];
  const roomId = user.roomId;
  const room = rooms[roomId];

  if (room) {
    // Remove the user from the room
    room.clients = room.clients.filter((clientUuid) => clientUuid !== uuid);
    if (room.clients.length ===  0) {
      // If the room is empty, delete it
      delete rooms[roomId];
    }
  }

  console.log(`${user.username} disconnected`);
  delete connections[uuid];
  delete users[uuid];
  broadcast(roomId); // Broadcast to the same room
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
    selected: {},
  };
  connection.on("message", (message) => handleMessage(message, uuid));
  connection.on("close", () => handleClose(uuid));
});

server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
