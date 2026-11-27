import {themeVariables,nameStyles} from './profile-theme.js';
import {avatarImage} from './profile-image.js';
import {cosmeticLayer} from './cosmetics.js';
export function setupVoice({socket,getRoom,t,safe,notify,call}) {
  const links=new Map();
  const locallyMuted=new Set();
  let stream;
  let roster=[];
  let joined=false;
  let pending=false;
  let muted=false;
  let deaf=false;
  let listen=false;
  let generation=0;
  let roomCode;
  let iceServers=[];
  const stage=document.querySelector('#voice-stage');
  const meters=new Map();
  const speaking=new Set();
  let audioContext,meterTimer;

  function untrack(id){
    const meter=meters.get(id);
    if(meter){meter.source.disconnect();meter.analyser.disconnect();meters.delete(id);}
    speaking.delete(id);
  }
  function trackVoice(id,media){
    untrack(id);
    if(!audioContext||!media?.getAudioTracks().length)return;
    try{
      const source=audioContext.createMediaStreamSource(media);
      const analyser=audioContext.createAnalyser();
      analyser.fftSize=256;
      source.connect(analyser);
      meters.set(id,{source,analyser,samples:new Float32Array(analyser.fftSize),lastHeard:0});
    }catch{/* Voice playback works if metering is unavailable. */}
  }
  function displaySpeaking(){
    for(const tile of document.querySelectorAll('[data-voice-tile]')){
      const active=speaking.has(tile.dataset.voiceTile);
      tile.classList.toggle('voice-speaking',active);
      tile.querySelector('.voice-speaking-label').hidden=!active;
    }
  }
  function tickMeters(){
    const own=getRoom()?.id;
    const now=performance.now();
    for(const peer of roster){
      const isLocal=peer.id===own;
      const meter=meters.get(peer.id);
      const quiet=peer.hostMuted||peer.hostDeaf||peer.listen||(isLocal?muted||deaf:
        peer.muted||deaf||locallyMuted.has(peer.id)||links.get(peer.id)?.audio.muted);
      if(!meter||quiet||audioContext?.state!=='running'){speaking.delete(peer.id);continue;}
      meter.analyser.getFloatTimeDomainData(meter.samples);
      let energy=0;
      for(const sample of meter.samples)energy+=sample*sample;
      if(energy/meter.samples.length>.00024)meter.lastHeard=now;
      if(meter.lastHeard&&now-meter.lastHeard<360)speaking.add(peer.id);
      else speaking.delete(peer.id);
    }
    displaySpeaking();
  }
  function startMeters(){
    const Audio=window.AudioContext??window.webkitAudioContext;
    if(!Audio||audioContext)return;
    try{
      audioContext=new Audio();
      audioContext.resume().catch(()=>{});
      meterTimer=setInterval(tickMeters,100);
    }catch{/* Some browsers restrict audio analysis. */}
  }
  stage.addEventListener('close',()=>{if(!stage.open)paint();});

  const self=()=>roster.find(peer=>peer.id===getRoom()?.id);
  const updateAudio = () => {
    const mine=self();
    for(const track of stream?.getAudioTracks()??[])track.enabled=!(muted||deaf||mine?.hostMuted||mine?.hostDeaf);
    for(const [id,link] of links){
      const sender=roster.find(peer=>peer.id===id);
      link.audio.muted=deaf||Boolean(mine?.hostDeaf)||locallyMuted.has(id)||Boolean(sender?.hostMuted||sender?.hostDeaf);
    }
  };

  function paint() {
    const panel=document.querySelector('#voice-room');
    if(!panel){if(stage.open)stage.close();return;}
    if(stage.open)panel.innerHTML='';
    const surface=stage.open?stage.querySelector('.voice-stage-body'):panel;
    surface.classList.toggle('voice-joined',joined);
    const action=(key,cmd,classes='secondary')=>'<button type="button" class="button '+classes+'" data-voice="'+cmd+'">'+t(key)+'</button>';
    const context=getRoom();
    const moderation=(peer,field,on,off)=>'<button type="button" class="button secondary" data-voice="moderate" data-peer="'+safe(peer.id)+
      '" data-field="'+field+'" data-value="'+(!peer[field])+'">'+t(peer[field]?off:on)+'</button>';
    const people = roster.map(peer=>{
      const link=links.get(peer.id);
      const you=peer.id===getRoom()?.id;
      const status=peer.hostDeaf?'voiceHostDeaf':peer.hostMuted?'voiceHostMuted':you ? 'you' : link?.pc.connectionState==='connected' ?
        peer.listen ? 'voiceListen' : peer.muted ? 'voiceMuted' : 'voiceLive' :
        ['failed','disconnected'].includes(link?.pc.connectionState) ? 'voiceUnavailablePeer' : 'voiceLinking';
      const avatar=avatarImage(peer.avatar,safe)||safe([...peer.name][0]??'◆');
      const decoration=cosmeticLayer('decoration',peer.decoration);
      const effect=cosmeticLayer('effect',peer.effect);
      const classicDecoration=['orbit','frame','stars','crystal','flare'].includes(peer.decoration)?' voice-deco-'+peer.decoration:'';
      const classicEffect=['shine','float'].includes(peer.effect)?' voice-effect-'+peer.effect:'';
      const theme=themeVariables(peer.themeTop,peer.themeBottom);
      const nameStyle=nameStyles.includes(peer.nameStyle)?peer.nameStyle:'default';
      return '<li class="voice-member'+classicDecoration+classicEffect+' name-style-'+nameStyle+(theme?' voice-themed':'')+
        '" style="'+theme+'" data-voice-tile="'+safe(peer.id)+'">'+effect+
        '<span class="voice-portrait"><span class="voice-avatar">'+avatar+'</span>'+decoration+
        '<span class="voice-indicator '+(status==='voiceLive'?'voice-live':'')+'" aria-hidden="true"></span></span><span class="voice-member-caption"><bdi>'+safe(peer.name)+
        '</bdi><small>'+t(status)+'</small><small class="voice-speaking-label" hidden>'+t('voiceSpeaking')+'</small></span><div class="voice-member-actions">'+(!you ? '<button class="button secondary voice-peer" type="button" data-voice="peer" data-peer="'+safe(peer.id)+
          '" aria-pressed="'+locallyMuted.has(peer.id)+'">'+t(locallyMuted.has(peer.id)?'voiceHearPeer':'voiceMutePeer')+'</button>' : '')+(context?.host&&!you?moderation(peer,'hostMuted','voiceForceMute','voiceReleaseMute')+moderation(peer,'hostDeaf','voiceForceDeaf','voiceReleaseDeaf'):'')+'</div></li>';
    }).join('');
    surface.innerHTML='<div class="voice-heading"><div class="voice-mark" aria-hidden="true">◖))</div><div><h2>'+t('voiceChat')+
      '</h2><p>'+t(context?.enabled===false?'voiceDisabled':joined ? listen ? 'voiceListen' : muted ? 'voiceMuted' : 'voiceLive' : pending ? 'voiceJoining' : 'voicePrivacy')+'</p></div></div>'+
      '<div class="voice-actions">'+(context?.host?action(context.enabled?'voiceDisable':'voiceEnable','settings'):'')+(context?.enabled===false?'':joined ? (!listen ? action(muted?'voiceUnmute':'voiceMute','mute') : '')+
        action(deaf?'voiceUndeafen':'voiceDeafen','deaf')+action(stage.open?'voiceCollapse':'voiceExpand','stage')+action('voiceLeave','leave','danger') :
        pending ? '' : action('voiceJoin','join','primary')+action('voiceListen','listen'))+'</div>'+
      (people ? '<ul class="voice-people">'+people+'</ul>' : '');
    displaySpeaking();
  }

  const send=(to,data)=>socket.emit('voice:signal',{to,data});
  function closeLink(id) {
    const link=links.get(id);
    if(!link) return;
    links.delete(id);
    untrack(id);
    link.pc.close();
    link.audio.remove();
  }
  function stop(signal=false) {
    generation++;
    if(signal) socket.emit('voice:leave');
    for(const id of links.keys()) closeLink(id);
    stream?.getTracks().forEach(track=>track.stop());
    stream=undefined;
    for(const id of meters.keys())untrack(id);
    clearInterval(meterTimer);
    audioContext?.close().catch(()=>{});
    audioContext=undefined;
    if(stage.open)stage.close();
    roster=[];
    locallyMuted.clear();
    pending=false;
    joined=false;
    muted=false;
    deaf=false;
    listen=false;
    roomCode=undefined;
    paint();
  }

  function peer(id) {
    if(links.has(id)) return links.get(id);
    const pc=new RTCPeerConnection({iceServers});
    const audio=document.createElement('audio');
    audio.autoplay=true;
    audio.hidden=true;
    document.body.append(audio);
    const link={pc,audio,candidates:[],tasks:Promise.resolve()};
    links.set(id,link);
    const track=stream?.getAudioTracks()[0];
    if(track) pc.addTransceiver(track,{streams:[stream],direction:'sendrecv'});
    else pc.addTransceiver('audio',{direction:'recvonly'});
    pc.onicecandidate=event=>{
      if(event.candidate&&links.get(id)===link) send(id,{type:'candidate',candidate:event.candidate.toJSON()});
    };
    pc.ontrack=event=>{
      audio.srcObject=event.streams[0] ?? new MediaStream([event.track]);
      trackVoice(id,audio.srcObject);
      updateAudio();
      audio.play().catch(()=>{});
    };
    pc.onconnectionstatechange=paint;
    pc.oniceconnectionstatechange=paint;
    return link;
  }
  function enqueue(id,task) {
    const link=peer(id);
    link.tasks=link.tasks.then(()=>links.get(id)===link && task(link)).catch(()=>{
      if(links.get(id)===link) { link.pc.close(); paint(); }
    });
  }

  socket.on('voice:roster',snapshot=>{
    const context=getRoom();
    if(!joined || snapshot.code!==roomCode || snapshot.code!==context?.code) return;
    roster=snapshot.peers;
    updateAudio();
    const ids=new Set(self()?.hostDeaf?[]:roster.filter(item=>!item.hostDeaf).map(item=>item.id));
    for(const id of links.keys()) if(!ids.has(id)) closeLink(id);
    for(const id of ids) if(id!==context.id && context.id<id && !links.has(id)) {
      enqueue(id,async ({pc})=>{
        await pc.setLocalDescription(await pc.createOffer());
        if(pc.signalingState!=='closed') send(id,pc.localDescription.toJSON());
      });
    }
    paint();
  });
  socket.on('voice:signal',packet=>{
    if(!joined||self()?.hostDeaf||!roster.some(peer=>peer.id===packet.from&&!peer.hostDeaf)) return;
    const {from,data}=packet;
    enqueue(from,async ({pc,candidates})=>{
      if(data.type==='candidate') {
        if(pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else candidates.push(data.candidate);
        return;
      }
      await pc.setRemoteDescription(data);
      for(const candidate of candidates.splice(0)) await pc.addIceCandidate(candidate).catch(()=>{});
      if(data.type==='offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        if(pc.signalingState!=='closed') send(from,pc.localDescription.toJSON());
      }
    });
  });
  socket.on('voice:closed',()=>stop());
  socket.on('disconnect',()=>stop());

  async function join(asListener) {
    const context=getRoom();
    if(!context || !context.enabled || pending || joined) return;
    if(!window.isSecureContext || !window.RTCPeerConnection || (!asListener && !navigator.mediaDevices?.getUserMedia)) {
      notify('voiceSecure');
      return;
    }
    startMeters();
    const attempt=++generation;
    pending=true;
    roomCode=context.code;
    paint();
    if(!asListener) {
      try {
        const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        if(attempt!==generation || roomCode!==getRoom()?.code) {
          mic.getTracks().forEach(track=>track.stop());
          return;
        }
        stream=mic;
        trackVoice(context.id,mic);
        mic.getAudioTracks()[0].addEventListener('ended',()=>{if(stream===mic){stop(true);notify('voiceMic');}});
      } catch {
        if(attempt===generation) {stop();notify('voiceMic');}
        return;
      }
    }
    socket.timeout(5000).emit('voice:join',{listen:asListener},(error,response)=>{
      if(attempt!==generation) return;
      if(error || !response?.ok) {stop(Boolean(error));notify(response?.error ?? 'timeout');return;}
      iceServers=response.iceServers;
      pending=false;
      listen=asListener;
      muted=asListener;
      joined=true;
      paint();
    });
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-voice]');
    if(!button) return;
    const cmd=button.dataset.voice;
    if(cmd==='settings'||cmd==='moderate'){
      button.disabled=true;
      const result=cmd==='settings'?await call('voice:settings',{enabled:!getRoom()?.enabled}):
        await call('voice:moderate',{id:button.dataset.peer,field:button.dataset.field,value:button.dataset.value==='true'});
      if(!result.ok)notify(result.error);
      button.disabled=false;
      return;
    }
    if(cmd==='join'||cmd==='listen') {void join(cmd==='listen');return;}
    if(cmd==='stage'){
      if(stage.open)stage.close();
      else{stage.showModal();paint();stage.querySelector('[data-voice=stage]')?.focus();}
      return;
    }
    if(cmd==='leave') {stop(true);return;}
    if(cmd==='mute') {
      muted=!muted;
      stream?.getAudioTracks().forEach(track=>{track.enabled=!muted;});
      socket.emit('voice:mute',{muted});
    }
    if(cmd==='deaf') deaf=!deaf;
    if(cmd==='peer') {
      const id=button.dataset.peer;
      if(locallyMuted.has(id)) locallyMuted.delete(id);
      else locallyMuted.add(id);
    }
    updateAudio();
    for(const {audio} of links.values()) audio.play().catch(()=>{});
    paint();
  });
  return {
    sync() {
      if(roomCode && (roomCode!==getRoom()?.code||getRoom()?.enabled===false)) stop(true);
      else paint();
    }
  };
}
