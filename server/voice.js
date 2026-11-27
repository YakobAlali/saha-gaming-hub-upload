const MAX_VOICE = 8;

export function createVoice({memberRoom,peerView,iceServers=[],siteMuted=()=>false}) {
  const channels = new Map();
  function restrictions(room,id){const a=room?.voiceModeration?.[id],b=room?.staffVoice?.[id];return {hostMuted:Boolean(a?.hostMuted||b?.hostMuted||siteMuted(id)),hostDeaf:Boolean(a?.hostDeaf||b?.hostDeaf)};}
  function broadcast(code) {
    const channel=channels.get(code);
    if (!channel?.size) { channels.delete(code); return; }
    const peers=[...channel].map(([id,entry]) => ({id,...peerView(id),muted:entry.muted,listen:entry.listen,...restrictions(memberRoom(id),id)}));
    for (const entry of channel.values()) entry.socket.emit('voice:roster',{code,peers});
  }
  function prune() {
    for (const [code,channel] of channels) {
      let changed=false;
      for (const [id,entry] of channel) if (memberRoom(id)?.code !== code||memberRoom(id)?.voiceEnabled===false) {
        channel.delete(id);
        entry.socket.emit('voice:closed');
        changed=true;
      }
      if (changed) broadcast(code);
    }
  }
  function attach(socket,id) {
    let code;
    let signalCount=0;
    let windowStart=0;
    const current = () => channels.get(code)?.get(id)?.socket === socket && memberRoom(id)?.code === code && memberRoom(id)?.voiceEnabled!==false ? channels.get(code) : null;
    function leave() {
      if (channels.get(code)?.get(id)?.socket !== socket) { code=undefined; return; }
      channels.get(code).delete(id);
      broadcast(code);
      code=undefined;
    }
    socket.on('voice:join',(payload,ack)=>{
      if (typeof ack !== 'function') return;
      const room=memberRoom(id);
      if (!room) return ack({ok:false,error:'noRoom'});
      if(room.voiceEnabled===false)return ack({ok:false,error:'voiceDisabled'});
      const channel=channels.get(room.code) ?? new Map();
      if (channel.has(id)) return ack({ok:false,error:'voiceOtherTab'});
      if (channel.size>=MAX_VOICE) return ack({ok:false,error:'voiceFull'});
      code=room.code;
      const listen=payload?.listen===true;
      channel.set(id,{socket,muted:listen,listen});
      channels.set(code,channel);
      ack({ok:true,iceServers});
      broadcast(code);
    });
    socket.on('voice:mute',(payload)=>{
      const channel=current();
      if (!channel) return;
      const self=channel.get(id);
      const next=self.listen || payload?.muted===true;
      if (self.muted===next) return;
      self.muted=next;
      broadcast(code);
    });
    socket.on('voice:leave',leave);
    socket.on('voice:signal',(payload)=>{
      const channel=current();
      const target=channel?.get(payload?.to);
      const room=memberRoom(id);
      if (!target||target.socket===socket||restrictions(room,id).hostDeaf||restrictions(room,payload.to).hostDeaf)return;
      const now=Date.now();
      if(now-windowStart>10000){windowStart=now;signalCount=0;}
      if(++signalCount>180) return;
      const data=payload.data;
      if(!data || typeof data!=='object') return;
      if (data.type==='offer'||data.type==='answer') {
        if(typeof data.sdp!=='string'||data.sdp.length>6200) return;
        target.socket.emit('voice:signal',{from:id,data:{type:data.type,sdp:data.sdp}});
      } else if (data.type==='candidate'&&data.candidate&&typeof data.candidate.candidate==='string'&&data.candidate.candidate.length<1500) {
        const {candidate,sdpMid,sdpMLineIndex,usernameFragment}=data.candidate;
        target.socket.emit('voice:signal',{from:id,data:{type:'candidate',candidate:{candidate,sdpMid,sdpMLineIndex,usernameFragment}}});
      }
    });
    socket.on('disconnect',leave);
  }
  function moderate(room,{id,field,value},staff=false){
    if(typeof id!=='string'||!staff&&(id===room.host||!channels.get(room.code)?.has(id))||
      !['hostMuted','hostDeaf'].includes(field)||typeof value!=='boolean')return false;
    const entries=staff?(room.staffVoice??={}):(room.voiceModeration??={});
    const policy=entries[id]??={};
    if(value)policy[field]=true;
    else delete policy[field];
    if(!policy.hostMuted&&!policy.hostDeaf)delete entries[id];
    broadcast(room.code);
    return true;
  }
  return {attach,prune,moderate,broadcast};
}

export function readIceServers(value) {
  if (!value) return [];
  const parsed=JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('VOICE_ICE_SERVERS must be a JSON array');
  return parsed;
}
