const labels = {
  skip:['تجاوز إلى المحتوى','Skip to content'], brand:['ساحة','Saha'], brandSub:['منصة اللعب الجماعي','Multiplayer gaming hub'],
  home:['الرئيسية','Home'], games:['مكتبة الألعاب','Game library'], rooms:['الغرف','Rooms'], rankings:['الترتيب','Leaderboard'], language:['English','العربية'],
  connected:['متصل بالخادم','Connected to server'], disconnected:['جارٍ الاتصال بالخادم','Connecting to server'],
  heroTag:['لوبي اللعب الجماعي','MULTIPLAYER LOBBY'], heroLine:['اللعب أحلى','Good games.'], heroAccent:['مع الأصدقاء.','Better with friends.'],
  heroText:['اجمع أصحابك في غرفة، اختاروا لعبتكم، وتقابلوا في المتصفح برمز دعوة واحد.','Get your friends together, pick a game, and meet in your browser with a single invite code.'],
  create:['إنشاء غرفة','Create room'], join:['انضم برمز','Join by code'], online:['لاعب متصل','Players online'], open:['غرفة عامة','Public rooms'], catalogCount:['ألعاب في المكتبة','Games in library'],
  gameDescription:['تعرّف على الألعاب وقواعدها قبل اختيار غرفة.','Explore the games and read the rules before choosing a room.'], viewGames:['عرض المكتبة','Browse library'],
  publicRooms:['الغرف العامة','Public rooms'], publicDescription:['انضم إلى غرفة فيها مقعد متاح أو أنشئ غرفتك.','Take an open seat or create your own room.'],
  noRooms:['لا توجد غرف عامة حالياً','No public rooms yet'], noRoomsText:['أنشئ غرفة عامة ليجدها اللاعبون هنا.','Create a public room to list it here.'], roomFull:['ممتلئة','Full'],
  points:['نقاط','Points'], rankDescription:['كل فوز يضيف ثلاث نقاط إلى رصيد اللاعب.','Each win adds three points to a player’s score.'],
  noRank:['لا يوجد لاعبون في الترتيب بعد','No ranked players yet'], noRankText:['يظهر اللاعبون في الترتيب بعد دخول أول غرفة.','Players appear on the leaderboard after entering their first room.'], viewRanks:['عرض الترتيب','View leaderboard'],
  roomName:['اسم الغرفة','Room name'], nickname:['اسم العرض','Display name'], game:['اللعبة','Game'], roomCode:['رمز الغرفة','Room code'], listed:['إظهار الغرفة في قائمة الغرف العامة','List this room publicly'],
  close:['إغلاق','Close'], copy:['نسخ رابط الدعوة','Copy invite link'], copied:['تم نسخ رابط الدعوة.','Invite link copied.'], copyFailed:['انسخ رابط الدعوة من الحقل.','Copy the invite link from the field.'],
  invite:['دعوة الأصدقاء','Invite friends'], leave:['مغادرة الغرفة','Leave room'], players:['اللاعبون','Players'], host:['المضيف','Host'], ready:['مستعد','Ready'], waiting:['بانتظار الاستعداد','Getting ready'], offline:['غير متصل','Offline'], you:['أنت','You'],
  markReady:['أنا مستعد','I’m ready'], unready:['إلغاء الاستعداد','Unready'], roomChat:['محادثة الغرفة','Room chat'], noChat:['أرسل أول رسالة إلى المجموعة.','Send the first message to the group.'], message:['اكتب رسالة…','Write a message…'], send:['إرسال','Send'], emptySeat:['مقعد متاح','Open seat'],
  rules:['قواعد اللعبة','Game rules'], planned:['اللعب في مرحلة لاحقة','Play in a later phase'], playable:['متاحة للعب','Available to play'],
  staging:['يمكنكم تجهيز الغرفة والمحادثة الآن. اللعب بهذه اللعبة متاح في مرحلة لاحقة.','You can set up your room and chat now. This game becomes playable in a later phase.'],
  start:['ابدأ المباراة','Start match'], needReady:['يبدأ المضيف عندما يكتمل العدد ويصبح الجميع مستعدين.','The host can start when enough players are present and everyone is ready.'],
  private:['غرفة برمز دعوة','Invite-only room'], public:['غرفة عامة','Public room'],
  badName:['أدخل اسم عرض من حرفين على الأقل.','Enter a display name with at least two characters.'],
  badRoom:['أدخل اسم الغرفة واختر لعبة.','Enter a room name and select a game.'], badCode:['رمز الغرفة غير صالح أو الغرفة مغلقة.','That room code is invalid or the room has closed.'],
  full:['اكتمل عدد اللاعبين في هذه الغرفة.','This room is full.'], already:['غادر غرفتك الحالية أولاً.','Leave your current room first.'], noRoom:['انضم إلى غرفة أولاً.','Join a room first.'],
  badMessage:['اكتب رسالة قبل الإرسال.','Write a message before sending.'], slow:['تمهّل قليلاً ثم حاول مجدداً.','Wait a moment and try again.'],
  forbidden:['هذا الإجراء متاح للمضيف فقط.','Only the host can do that.'], unavailable:['اللعب بهذه اللعبة غير متاح حالياً.','This game is not playable yet.'],
  notReady:['تأكد من العدد واستعداد جميع اللاعبين.','Check the player count and everyone’s readiness.'], badMove:['هذه الحركة غير صالحة.','That move is invalid.'],
  running:['هناك مباراة جارية في الغرفة.','A match is in progress.'], serverError:['حدث خطأ في الخادم. حاول مجدداً.','Something went wrong on the server.'],
  timeout:['تأخر رد الخادم. تحقق من الاتصال.','The server took too long to respond. Check your connection.']
};

const games = {
  chess:[
    ['الشطرنج','استراتيجية','معركة تكتيكية على ٦٤ مربعاً.','يحرّك اللاعبان قطعة واحدة بالتناوب. تتحرك كل قطعة وفق نمطها، ولا يجوز ترك الملك في كش. يفوز من يحقق كش مات، وقد تنتهي المباراة بالتعادل.'],
    ['Chess','Strategy','A battle of tactics on 64 squares.','Players alternate moving one piece. Each piece moves according to its own rules. Checkmate wins. Some positions end in a draw.']
  ],
  color:[
    ['أونو','ورق','طابق اللون أو الرقم وخلّص أوراقك.','العب بطاقة توافق اللون أو الرقم أو الرمز الظاهر. السحب ينهي الدور. تعكس البطاقات الخاصة الاتجاه أو تتخطى الدور أو تفرض السحب. اختر اللون عند لعب ورقة تغيير اللون. تلعب +٤ فقط إذا خلت يدك من اللون الحالي. يفوز من ينهي أوراقه أولاً.'],
    ['UNO-style','Cards','Match colors or numbers and empty your hand.','Play a card matching the visible color, number, or symbol. Drawing ends your turn. Action cards reverse play, skip a turn, or force a draw. Choose the next color when playing a wild. Play +4 only when you have no card of the current color. The first to empty their hand wins.']
  ],
  ludo:[
    ['لودو','لوحية','أربعة بيادق وسباق نحو خط النهاية.','ارمِ النرد وحرك بيدقاً بعدد الخانات الظاهر. تحتاج إلى ٦ لإخراج بيدق من القاعدة. الوصول إلى خانة خصم خارج المناطق الآمنة يعيده إلى قاعدته. يفوز أول من يصل ببيادقه الأربعة إلى النهاية.'],
    ['Ludo','Board','Four pawns in a race to the finish.','Roll the die and move a pawn the number of spaces shown. A 6 brings a pawn out of base. Landing on an opponent outside a safe square sends them back to base. Bring all four pawns home to win.']
  ],
  tarneeb:[
    ['طرنيب','ورق','مزايدة ولعب بالشراكة على ١٣ أكلة.','يلعب فريقان من لاعبين. يختار الفائز بالمزايدة نوع الطرنيب. اتبع نوع الورقة الأولى إن استطعت. تفوز أقوى ورقة طرنيب بالأكلة، وإلا فأقوى ورقة من النوع المفتوح. يحاول فريق المزايد تحقيق عدد الأكلات الذي التزم به.'],
    ['Tarneeb','Cards','A partnership trick-taking game with bidding.','Two teams of two play. The winning bidder selects trump. Follow the led suit if you can. The highest trump wins the trick, or the highest card of the led suit if no trump was played. The bidding team tries to reach its bid.']
  ],
  connect:[
    ['أربعة على التوالي','استراتيجية','كوّن سلسلة من أربع قطع قبل خصمك.','أسقط قطعة في عمود غير ممتلئ في دورك. يفوز أول من يصل أربع قطع أفقياً أو عمودياً أو قطرياً. إذا امتلأت اللوحة دون فائز فالنتيجة تعادل.'],
    ['Four in a Row','Strategy','Line up four pieces before your opponent.','On your turn, drop a piece into a column with space. Connect four horizontally, vertically, or diagonally to win. A full board without a winner is a draw.']
  ],
  domino:[
    ['دومينو','لوحية','طابق الأطراف وتخلّص من قطعك.','ضع قطعة بحيث يطابق أحد طرفيها الطرف المفتوح من السلسلة. اسحب عند تعذر اللعب ما دام السحب ممكناً، أو مرّر الدور. يفوز من ينهي قطعه أولاً، أو من يحمل أقل مجموع عند انسداد اللعب.'],
    ['Dominoes','Board','Match the ends and clear your tiles.','Add a tile whose end matches an open end of the chain. Draw if you cannot play and tiles are available, otherwise pass. The first to clear their tiles wins. If play is blocked, the lowest pip total wins.']
  ]
};
export const dictionary = Object.fromEntries(['ar','en'].map((language, index) =>
  [language, Object.fromEntries(Object.entries({ ...labels, ...games }).map(([key, values]) => [key, values[index]]))]
));
