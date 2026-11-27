import {randomBytes} from 'node:crypto';
import {catalog} from '../public/catalog.js';
import {timers} from './flow.js';

export const findRoom=(rooms,id)=>Object.values(rooms).find(room=>room.members.some(member=>member.id===id)||room.spectators.includes(id));

export function roomMembership({rooms,players,clean,invalid,id,identity,ensureFree,named}){
  function createRoom(data) {
    ensureFree();
    const game = catalog.find(entry => entry.id === data.game);
    const name = clean(data.name, 40);
    if (!name || !game) invalid('badRoom');
    const nickname = named(data.nickname);
    let code;
    do { code = randomBytes(4).toString('hex').toUpperCase(); } while (rooms[code]);
    if(!identity || !players[id].customDisplayName) players[id].name = nickname;
    const turnSeconds = timers.includes(data.turnSeconds) ? data.turnSeconds : 0;
    const room = { code, name, turnSeconds, voiceEnabled:data.voiceEnabled!==false, botFill: data.botFill === true, game: game.id, listed: data.listed === true, capacity: game.max, host: id, allowSpectators: data.allowSpectators !== false, spectators: [], members: [{ id, ready: false }], chat: [], match: null };
    rooms[code] = room;
    return room;
  }
  function joinRoom(data) {
    ensureFree();
    const code = clean(data.code, 16).toUpperCase();
    const room = /^[A-F0-9]{8}$/.test(code) && rooms[code];
    if (!room) invalid('badCode');
    if (data.role === 'spectator') {
      if (!room.allowSpectators) invalid('spectatorsDisabled');
      if (room.spectators.length >= 24) invalid('spectatorsFull');
      if(!identity || !players[id].customDisplayName) players[id].name = named(data.nickname);
      room.spectators.push(id);
      return room;
    }
    if (room.match && !room.match.finished) invalid('running');
    if (room.members.length >= room.capacity && !room.members.some(member => players[member.id].bot)) invalid('full');
    const nickname = named(data.nickname);
    if(!identity || !players[id].customDisplayName) players[id].name = nickname;
    if (room.match?.finished) room.match = null;
    if (room.members.length >= room.capacity) {
      const index = room.members.findLastIndex(member => players[member.id].bot);
      delete players[room.members[index].id];
      room.members.splice(index,1,{ id, ready:false });
    } else room.members.push({ id, ready: false });
    return room;
  }
  return {createRoom,joinRoom};
}
