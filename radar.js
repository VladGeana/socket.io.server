const moment = require('moment');
const { SOURCE, ROOM_TYPE } = require('./types');

const clc = require('cli-color');
const { relativeTimeThreshold } = require('moment');
const success = clc.red.green;
const error = clc.red.bold;
const warn = clc.yellow;
const info = clc.cyan;
const highlight = clc.magenta;
// globals
let namespace = '/';
let pendingVisitors = new Map();

const getNow = () => {
  return moment().format('lll');
};

function printJson(json) {
  return JSON.stringify(json, null, 3);
}

const logResults = (function () {
  let logResults = [];
  let title = 'Log Results';
  let collapsed = true;

  function entry(message) {
    {
      this.time = moment().format('HH:MM:SS');
      this.message = message.text;
      this.level = message.level || 0;
      this.type = message.type || 'output';
    }
  }

  return {
    hasData: function () {
      return logResults.length;
    },

    entitle: function (caption, collapsed = true) {
      if (!this.hasData()) title = caption;
      this.collapsed = collapsed;
    },

    //{type:'', level:'', date:'', message:''}
    add: function (e) {
      logResults.push(new entry(e));
    },

    clear: function () {
      logResults = [];
    },

    show: function (clear = true) {
      if (this.collapsed) {
        console.groupCollapsed(title);
      } else {
        console.group(title);
      }
      console.table(logResults);
      console.groupEnd();
      if (clear) {
        logResults = [];
      }
    },
  };
})();

class ServerProxy {
  constructor(io) {
    this.io = io;
    this.pendingWarnings = new Map();
  }

  get sockets() {
    return Object.entries(this.io.nsps[namespace].adapter.nsp.sockets).reduce(
      (a, c) => {
        let query = c[1].handshake.query;
        let b = {
          id: c[0],
          room: query.room,
          visitor: query.visitor,
          uniqueName: query.id,
          namespace: query.nsp,
          connected: c[1].connected,
        };
        a.push(b);
        return a;
      },
      []
    );
  }
  get rooms() {
    return this.io.nsps[namespace].adapter.rooms;
  }
  get occupied() {
    return Object.entries(this.rooms).filter((v) => v[1].length > 1);
  }
  get available() {
    return this.sockets.filter((v) => v.room);
  }

  getOccupancy(room) {
    if (!room) {
      throw 'No room name specified';
    }
    return this.occupied.filter((v) => v[0] == room).length;
  }

  notifyRoom(data) {
    const { visitor, warning } = data;

    let warnedRooms = [];
    const id = warning[0];
    let message = {
      exposureDates: warning[1].dates,
      room: warning[1].room,
      visitor: visitor,
    };
    // see if the namespace includes this Room ID
    if (this.socketIsOnline(id)) {
      this.privateMessage(id, 'notifyRoom', message);
      warnedRooms.push(`${message.room} WARNED.`);
    } else {
      this.pendingWarnings.set(id, data);
      warnedRooms.push(`${message.room} PENDING.`);
    }
    return warnedRooms;
  }

  log() {
    let query = this.socket.handshake.query;
    if (query.room) {
      this.checkPendingRoomWarnings(query);
    }

    if (query.admin || query.visitor || query.room) {
      console.log(' ');
      console.log(
        highlight(
          moment().format('HH:mm:ss'),
          'In connection handler: Opening connection to a Room for:',
          query.admin || query.visitor || query.room,
          'using socketId:',
          query.id
        )
      );
    }

    this.openMyRoom();
  }

  handlePendings(query) {
    if (query.room || query.admin) {
      if (!this.pendingWarnings.size || !this.pendingWarnings.has(query.id)) {
        let msg = `Nothing pending for ${query.room}`;
        console.log(msg);

        return msg;
      }

      this.pendingWarnings.forEach((value, key) => {
        const message = {
          visitor: '',
          exposureDates: value,
          room: key,
        };
        this.privateMessage(query.room, 'notifyRoom', message);
        this.pendingWarnings.delete(key);
        console.groupCollapsed(`Pending Warnings for ${query.room}:`);

        console.log(warn(JSON.stringify(message, null, 3)));
        console.groupEnd();
      });
    } else if (query.visitor || query.admin) {
      if (!this.pendingWarnings.size || !this.pendingWarnings.has(query.id)) {
        let msg = `Nothing pending for ${query.visitor}`;
        console.log(msg);

        return msg;
      }

      this.pendingWarnings.forEach((value, key) => {
        const message = {
          visitor: key,
          exposureDates: value,
          room: '',
        };
        this.privateMessage(query.visitor, 'exposureAlert', message);
        console.groupCollapsed('Pending Alerts:');

        console.log(warn(JSON.stringify(message, null, 3)));
        console.groupEnd();
        this.pendingWarnings.delete(key);
      });
    }
  }

  // getAllSocketQueries() {
  //   let allSockets = Object.entries(
  //     this.io.nsps[namespace].adapter.nsp.sockets
  //   ).map((v) => {
  //     let q = v[1].handshake.query;
  //     if (q.admin) {
  //       return { admin: q.admin, id: q.id, nsp: q.nsp };
  //     } else if (q.visitor) {
  //       return { visitor: q.visitor, id: q.id, nsp: q.nsp };
  //     }
  //     return { room: q.room, id: q.id, nsp: q.nsp };
  //   });
  //   return allSockets;
  // }
  // getSockets(f) {
  //   let allSockets = Object.entries(
  //     this.io.nsps[namespace].adapter.nsp.sockets
  //   ).reduce((a, c) => {
  //     let query = c[1].handshake.query;
  //     let b = {
  //       id: c[0],
  //       room: query.room,
  //       visitor: query.visitor,
  //       uniqueName: query.id,
  //       namespace: query.nsp,
  //       connected: c[1].connected,
  //     };
  //     a.push(b);
  //     return a;
  //   }, []);
  //   console.log('All Sockets:');
  //   console.table(allSockets);
  //   allSockets = f ? f(allSockets) : allSockets;
  //   this.io.of(namespace).emit('allSocketsExposed', allSockets);
  //   return allSockets;
  // }

  // getRooms(roomType) {
  //   if (!this.io.nsps[namespace]) {
  //     console.error(`${namespace} is invalid. Resetting to default "/" value.`);
  //     namespace = '/';
  //   }
  //   let rooms;

  //   if (roomType == ROOM_TYPE.RAW) {
  //     this.io.of(namespace).emit('allRoomsExposed', this.rooms);
  //     return roomIds;
  //   }

  //   switch (roomType) {
  //     case ROOM_TYPE.PENDING:
  //       // if (!pendingRooms.size) {
  //       //   return [];
  //       // }
  //       if (this.pendingWarnings.size) {
  //         console.log('Pending Rooms:');
  //         console.table([...pendingWarnings]);
  //       } else {
  //         console.log('No Rooms pending');
  //       }
  //       this.io.of(namespace).emit('pendingRoomsExposed', [...pendingWarnings]);

  //       break;

  //     case ROOM_TYPE.AVAILABLE:
  //       // rooms = getAvailableRooms().map((v) => {
  //       //   checkPendingRoomWarnings(v);
  //       //   return { name: v.room, id: v.id, nsp: v.nsp };
  //       // });
  //       rooms = this.getAllSocketQueries().filter((v) => v.room);
  //       rooms.forEach((room) => this.checkPendingRoomWarnings(room));
  //       if (rooms) {
  //         console.log('Available Rooms:');
  //         console.table(rooms);
  //       } else {
  //         console.log('No Rooms available');
  //       }
  //       // sending to all clients in namespace, including sender
  //       this.io.of(namespace).emit('availableRoomsExposed', rooms);
  //       return rooms;

  //     case ROOM_TYPE.OCCUPIED:
  //       // do we see length in keys?
  //       rooms = Object.entries(this.rooms).filter((v) => v[1].length > 1);
  //       if (rooms) {
  //         console.log('Occupied Rooms:');
  //         console.table(rooms);
  //       } else {
  //         console.log('No Rooms are occupied');
  //       } // sending to all clients in namespace 'myNamespace', including sender
  //       this.io.of(namespace).emit('occupiedRoomsExposed', rooms);
  //       return rooms;

  //     case ROOM_TYPE.VISITOR:
  //       rooms = this.getAllSocketQueries(this.io).filter((v) => v.visitor);
  //       if (rooms) {
  //         console.log('Visitor Rooms:');
  //         console.table(rooms);
  //       } else {
  //         console.log('No Visitor Rooms online');
  //       }
  //       // sending to all clients in namespace 'myNamespace', including sender
  //       console.log(
  //         info(
  //           `Emitting visitorsRoomsExposed to all sockets in namespace ${namespace}`
  //         )
  //       );
  //       this.io.of(namespace).emit('visitorsRoomsExposed', rooms);
  //       return rooms;
  //   }
  // }

  // openMyRoom(socket) {
  //   const query = socket.handshake.query;
  //   const name = query.visitor || query.room || query.admin;
  //   console.group('openMyRoom: ');
  //   // it may be possible that a Visitor Room houses two different sockets with the same name (but different query.ids)
  //   // so always check for the correct id given the subject socket
  //   socket.join(name);
  //   if (this.roomIdsIncludeSocket(name, socket.id)) {
  //     console.log(
  //       success(`${name}'s socket ${socket.id} added to their own named Room`)
  //     );
  //   } else {
  //     console.log(error(`Could not find ${name}'s Room`));
  //   }
  // }

  // peek(name) {
  //   const json = this.io.nsps[namespace].adapter.rooms[name].sockets;

  //   let str = warn('sockets:', JSON.stringify(json, null, '\t'));
  //   console.log(name, str);
  // }
  // Event Heloers
  privateMessage(room, event, message) {
    // sending to individual socketid (private message)
    // e.g.,
    // io.to(room).emit(
    //   'notifyRoom',
    //   {
    //     visitor: visitor,
    //     exposureDates: exposureDates, // exposure dates array
    //   }
    // );
    // note: cannot attach callback to namespace broadcast event
    this.io.to(room).emit(event, message);
  }

  roomIdsIncludeSocket(roomName, id) {
    try {
      const result = this.rooms[roomName] && this.rooms[roomName].sockets[id];
      return result;
    } catch (error) {
      console.error(error);
      console.log('Returning false');
      return false;
    }
  }

  socketIsOnline(id) {
    return this.io.nsps[namespace].sockets[id];
  }

  updateOccupancy(room) {
    if (room && this.rooms[room]) {
      let occupancy = this.rooms.length || 0;
      // sending to all clients in namespace 'myNamespace', including sender
      this.io.of(namespace).emit('updatedOccupancy', {
        room: room,
        occupancy: occupancy,
      });
      return occupancy;
    }
    return 0;
  }
}

module.exports = {
  getNow,
  logResults,
  ServerProxy,
};