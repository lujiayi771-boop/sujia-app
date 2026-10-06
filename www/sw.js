// 溯佳APP Service Worker - 修复版
// 部署时必须与 index.html 放在同一目录（GitHub Pages / Vercel 等 HTTPS 平台）
// 说明：本版本修复了「刷新后主界面壁纸/小组件图片消失」相关问题中的缓存部分：
//   - 页面导航(HTML)改为「网络优先」，确保每次都能加载到最新的 index.html，
//     避免旧 Service Worker 一直返回旧缓存导致修复不生效。
//   - 静态资源仍为「缓存优先」，保证离线可用与加载速度。

const CACHE_NAME='suijia-app-v24';

// HTML 页面：使用网络优先策略
const HTML_PAGES=['/','/index.html'];

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

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;

  var req=e.request;
  var url;
  try{url=new URL(req.url);}catch(err){return;}

  // 忽略跨域、Data URL、Blob URL
  if(url.origin!==self.location.origin)return;
  if(req.url.indexOf('data:')===0||req.url.indexOf('blob:')===0)return;

  // 判断是否为页面导航 / HTML 请求
  var isHTML=req.mode==='navigate'||
    HTML_PAGES.some(function(p){return url.pathname===p||url.pathname.endsWith(p);})||
    ((req.headers.get('accept')||'').indexOf('text/html')>-1);

  if(isHTML){
    // HTML：网络优先，失败时回退缓存
    e.respondWith(
      fetch(req).then(function(response){
        if(response&&response.status===200){
          try{
            var clone=response.clone();
            caches.open(CACHE_NAME).then(function(cache){cache.put(req,clone);}).catch(function(){});
          }catch(err){}
        }
        return response;
      }).catch(function(){return caches.match(req);})
    );
    return;
  }

  // 静态资源：缓存优先，后台更新缓存
  e.respondWith(
    caches.match(req).then(function(cached){
      var fetchPromise=fetch(req).then(function(response){
        if(response&&response.status===200&&(response.type==='basic'||response.type==='default')){
          try{
            var clone=response.clone();
            caches.open(CACHE_NAME).then(function(cache){cache.put(req,clone);}).catch(function(){});
          }catch(err){}
        }
        return response;
      }).catch(function(){return cached;});
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
    self.registration.getNotifications({tag:d.tag}).then(function(notifs){
      notifs.forEach(function(n){n.close();});
    }).catch(function(){});
  }else if(d.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  var data=e.notification.data||{};
  var chatId=data.chatId;
  var targetUrl=data.url||'./';
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){
        var client=list[i];
        if('focus'in client){
          if(chatId){try{client.postMessage({type:'OPEN_CHAT',chatId:chatId});}catch(err){}}
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

self.addEventListener('notificationclose',e=>{
  // 通知关闭时无需特殊处理
});
