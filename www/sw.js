// 溯佳APP Service Worker（独立文件版）
// 部署时与 index.html 放在同一目录（www/ 下）。
//
// 策略说明（重要）：
//   同源请求一律「网络优先，失败再回退缓存」。
//   这样你以后无论怎么改 index.html，手机/浏览器每次都会优先拿最新的页面，
//   不会再出现「改了却不生效、开关看不到」的问题。
//   ——不需要再手动修改任何版本号。
const CACHE_NAME='suijia-app-shell';

self.addEventListener('install',e=>{ self.skipWaiting(); });

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;

  let sameOrigin=false;
  try{ sameOrigin=new URL(req.url).origin===self.location.origin; }catch(err){}
  if(!sameOrigin)return; // 跨域资源交回浏览器默认处理

  e.respondWith(
    fetch(req).then(res=>{
      try{
        if(res&&res.status===200&&(res.type==='basic'||res.type==='default')){
          const clone=res.clone();
          caches.open(CACHE_NAME).then(c=>c.put(req,clone)).catch(()=>{});
        }
      }catch(err){}
      return res;
    }).catch(()=>caches.match(req))
  );
});

// ===== 以下为后台通知功能，保持原有能力 =====
self.addEventListener('message',e=>{
  var d=e.data;
  if(!d)return;
  if(d.type==='SHOW_NOTIFICATION'){
    var opts={
      body:d.body||'',
      tag:d.tag||'sim-chat',
      icon:d.icon||undefined,
      badge:d.icon||undefined,
      requireInteraction:false,
      vibrate:[200,100,200],
      data:d.data||{},
      silent:false
    };
    self.registration.showNotification(d.title||'新消息',opts).catch(function(){
      delete opts.icon;delete opts.badge;
      self.registration.showNotification(d.title||'新消息',opts).catch(function(){});
    });
  }else if(d.type==='PING'){
    e.waitUntil(Promise.resolve());
  }else if(d.type==='CLOSE_NOTIF'){
    self.registration.getNotifications({tag:d.tag}).then(notifs=>{
      notifs.forEach(n=>n.close());
    }).catch(()=>{});
  }
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const data=e.notification.data||{};
  const chatId=data.chatId;
  const targetUrl=data.url||'./';
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){
        var client=list[i];
        if('focus'in client){
          if(chatId){ try{client.postMessage({type:'OPEN_CHAT',chatId:chatId});}catch(err){} }
          return client.focus();
        }
      }
      if(self.clients.openWindow){
        var openUrl=targetUrl;
        if(chatId)openUrl += (openUrl.indexOf('?')>-1?'&':'?')+'openChat='+encodeURIComponent(chatId);
        return self.clients.openWindow(openUrl);
      }
    })
  );
});
self.addEventListener('notificationclose',e=>{});
