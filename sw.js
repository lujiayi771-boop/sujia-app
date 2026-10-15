// 溯佳APP Service Worker - 独立文件版
// 部署时必须与 index.html 放在同一目录
// 此文件使 GitHub Pages / Vercel 等HTTPS平台能正常注册SW，支持后台通知
//
// 【重要】每次发布新版 index.html，请把下面的 CACHE_NAME 版本号 +1（例如 v25 -> v26）。
// 本文件对“应用外壳”(index.html 页面) 采用“网络优先”策略，
// 否则手机/PWA 会一直显示缓存的旧版本，导致新功能（如“拼字卡模式”开关）看不到。

const CACHE_NAME='suijia-app-v25';

self.addEventListener('install',e=>{
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>{
      return Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    }).then(()=>self.clients.claim())
  );
});

// 是否“应用外壳”(HTML 页面) 请求：这类请求必须网络优先，保证更新立即生效
function isAppShell(request){
  try{
    if(request.mode==='navigate')return true;
    const url=new URL(request.url);
    if(url.origin!==self.location.origin)return false;
    const p=url.pathname;
    return p.endsWith('/')||p.endsWith('/index.html');
  }catch(err){
    return false;
  }
}

function putCache(req,response){
  try{
    if(response&&response.status===200&&(response.type==='basic'||response.type==='default')){
      const clone=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(req,clone)).catch(()=>{});
    }
  }catch(err){}
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;

  // 1) 应用外壳：网络优先，离线再回退缓存
  if(isAppShell(req)){
    e.respondWith(
      fetch(req).then(response=>{
        putCache(req,response);
        return response;
      }).catch(()=>{
        return caches.match(req).then(cached=>cached||caches.match('./index.html'));
      })
    );
    return;
  }

  // 2) 其它静态资源：缓存优先 + 后台更新
  e.respondWith(
    caches.match(req).then(cached=>{
      const fetchPromise=fetch(req).then(response=>{
        putCache(req,response);
        return response;
      }).catch(()=>cached);
      return cached||fetchPromise;
    })
  );
});

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
      // 图标不支持时重试无图标
      delete opts.icon;delete opts.badge;
      self.registration.showNotification(d.title||'新消息',opts).catch(function(){});
    });
  }else if(d.type==='PING'){
    // 心跳保活，保持SW活跃
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
      // 优先聚焦已打开的窗口并传递chatId
      for(var i=0;i<list.length;i++){
        var client=list[i];
        if('focus'in client){
          if(chatId){
            try{client.postMessage({type:'OPEN_CHAT',chatId:chatId});}catch(err){}
          }
          return client.focus();
        }
      }
      // 没有已打开窗口，新开
      if(self.clients.openWindow){
        var openUrl=targetUrl;
        if(chatId)openUrl += (openUrl.indexOf('?')>-1?'&':'?')+'openChat='+encodeURIComponent(chatId);
        return self.clients.openWindow(openUrl);
      }
    })
  );
});
self.addEventListener('notificationclose',e=>{
  // 通知关闭时无需特殊处理
});
