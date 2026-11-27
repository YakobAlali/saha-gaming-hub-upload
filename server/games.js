import {orbit} from './games/orbit.js';
import { chess } from './games/chess.js';
import { lineGame } from './games/line.js';
import { reversi } from './games/reversi.js';
import { uno } from './games/uno.js';
import { ludo } from './games/ludo.js';
import { domino } from './games/domino.js';
import { tarneeb } from './games/tarneeb.js';
import * as core from './games/core.js';
import {socialGames} from './social-games.js';
import {classicCards} from './classic-cards.js';
import { checkers } from './checkers.js';
import { replica } from './replica.js';

export const games = new Map([
  ['orbit',orbit],
  ...socialGames(core),
  ...classicCards(core),
  ['chess',chess], ['color',uno], ['ludo',ludo], ['tarneeb',tarneeb],
  ['connect',lineGame(6,7,4,true)], ['domino',domino], ['tic',lineGame(3,3,3,false)], ['reversi',reversi], ['gomoku',lineGame(11,11,5,false)], ['checkers',checkers], ['replica-ar',replica('ar')], ['replica-en',replica('en')]
]);
