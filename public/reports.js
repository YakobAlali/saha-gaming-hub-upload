async function send(path,body){
  const response=await fetch('/auth/discord/reports'+path,body===undefined?{cache:'no-store'}:
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:'reportInvalid'}));
  if(!response.ok)throw Error(result.error??'reportInvalid');
  return result;
}
function encode(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(Error('reportInvalid'));
    reader.readAsDataURL(blob);
  });
}
export function reportDetails(item,t,safe){
  const attachment='/auth/discord/reports/'+encodeURIComponent(item.id)+'/evidence';
  return (item.kind==='player'?'<p>'+t('reportTarget')+' <bdi>'+safe(item.target)+'</bdi> · '+t('reportReason_'+item.reason)+'</p>':'')+
    '<p dir="auto">'+safe(item.description)+'</p><a target="_blank" rel="noopener" href="'+attachment+'">'+
    t(item.media_type?.startsWith('video/')?'reportVideo':'reportScreenshot')+'</a>';
}
export function setupReports({route,render,t,safe,signedIn,prepareImage}){
  let data, message, pending=false, run=0;
  async function load(){
    if(route()!=='reports')return;
    const sequence=++run;
    data=null;
    pending=signedIn();
    render();
    try{
      if(pending){
        const result=await send('');
        if(sequence===run)data=result;
      }
    }catch(error){if(sequence===run)message=error.message;}
    finally{if(sequence===run){pending=false;if(route()==='reports')render();}}
  }
  window.addEventListener('hashchange',()=>{run++;message=null;void load();});
  document.addEventListener('change',event=>{
    const form=event.target.closest?.('[data-report=new]');
    if(!form||event.target.name!=='kind')return;
    const player=event.target.value==='player';
    const group=form.querySelector('.report-player-fields');
    group.hidden=!player;
    group.disabled=!player;
    form.elements.screenshot.accept=player?'image/jpeg,image/png,image/webp,video/mp4,video/webm':'image/jpeg,image/png,image/webp';
    form.elements.screenshot.value='';
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest?.('[data-report]');
    if(!form)return;
    event.preventDefault();
    const button=event.submitter??form.querySelector('button');
    if(button.disabled)return;
    const fields=new FormData(form);
    const values=Object.fromEntries(fields);
    const status=form.querySelector('[role=status]');
    button.disabled=true;
    try{
      if(form.dataset.report==='new'){
        const file=fields.get('screenshot');
        const video=values.kind==='player'&&['video/mp4','video/webm'].includes(file?.type);
        if(video&&file.size>16*1024*1024)throw Error('reportFileLarge');
        const image=await encode(video?file:await prepareImage(file,'report'));
        await send('',{title:values.title,description:values.description,kind:values.kind,target:values.target?.trim(),
          reason:values.reason,image,mediaType:video?file.type:'image/jpeg'});
        message='reportSent';
      }else if(form.dataset.report==='review'){
        await send('/review',{id:form.dataset.id,status:button.value});
        message='reportSaved';
      }else{
        await send('/plus',{id:values.id,tier:values.tier,days:Number(values.days)});
        message='reportSaved';
      }
      await load();
    }catch(error){status.textContent=t(error.message);}
    finally{button.disabled=false;}
  });
  function page(){
    const heading='<div class="page-head"><h1>'+t('reports')+'</h1></div>';
    const notice=message?'<p role="status" class="account-message">'+safe(t(message))+'</p>':'';
    if(!signedIn())return heading+'<button class="button primary" data-action="accountLogin">'+t('discordLogin')+'</button>';
    if(pending||!data)return heading+notice+(pending?'<p>'+t('profileLoading')+'</p>':'');
    const status='<p class="report-status" role="status"></p>';
    const submit=(name,value='')=>'<button type="submit" class="button secondary" value="'+value+'">'+t(name)+'</button>';
    const compose='<form data-report="new" class="panel profile-block report-form"><h2>'+t('reportNew')+'</h2>'+
      '<label>'+t('reportType')+'<select name="kind"><option value="bug">'+t('reportNew')+
      '</option><option value="player">'+t('reportPlayer')+'</option></select></label>'+
      '<fieldset class="report-player-fields" hidden disabled><label>'+t('reportTarget')+
      '<input name="target" dir="ltr" maxlength="36" required></label><label>'+t('reportReason')+'<select name="reason" required>'+
      '<option value=""></option>'+['abuse','harassment','cheating','spam','other'].map(reason=>'<option value="'+reason+'">'+
      t('reportReason_'+reason)+'</option>').join('')+'</select></label></fieldset>'+
      '<label>'+t('reportTitle')+'<input name="title" minlength="3" maxlength="80" required></label>'+
      '<label>'+t('reportDescription')+'<textarea name="description" rows="4" minlength="10" maxlength="1600" required></textarea></label>'+
      '<label>'+t('reportEvidence')+'<input type="file" name="screenshot" accept="image/jpeg,image/png,image/webp" required></label>'+
      '<p>'+t('reportPrivate')+'</p>'+status+submit('reportSubmit')+'</form>';
    const plus=data.owner?'<form data-report="plus" class="panel profile-block report-form"><h2>'+t('plusManage')+'</h2>'+
      '<label>'+t('plusPlayer')+'<input name="id" required dir="ltr"></label><label>'+t('plusTier')+'<select name="tier">'+
      ['bronze','silver','gold','none'].map(tier=>'<option value="'+tier+'">'+t(tier==='none'?'plusRemove':'sahaBadge_'+tier)+'</option>').join('')+
      '</select></label><label>'+t('plusDays')+'<input type="number" name="days" min="1" max="365" value="30"></label>'+
      status+submit('accountSave')+'</form>':'';
    const history='<section class="panel profile-block report-history"><h2>'+t(data.reviewer?'reportQueue':'reportHistory')+'</h2>'+
      (data.items.length?data.items.map(item=>'<article class="report-entry"><div><strong dir="auto">'+safe(item.title)+'</strong><span class="pill">'+
        t('report_'+item.status)+'</span></div>'+(item.kind==='player'?'<p>'+t('reportPlayer')+'</p>':'')+ (data.reviewer?reportDetails(item,t,safe)+(item.status==='pending'?'<form data-report="review" data-id="'+safe(item.id)+'">'+
        status+submit('reportApprove','confirmed')+submit('reportReject','rejected')+'</form>':''):'')+'</article>').join(''):
        '<p>'+t('reportEmpty')+'</p>')+'</section>';
    return heading+notice+'<div class="report-layout">'+compose+history+plus+'</div>';
  }
  return {page,load};
}
