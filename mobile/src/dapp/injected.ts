/**
 * JavaScript injected into the in-app browser before any page script runs. It installs an EIP-1193 provider as
 * window.ethereum and announces it through EIP-6963 as "Arc Kit Wallet", so usearckit.locker (wagmi) and any other
 * Arc dApp see a wallet without extensions. Every request is forwarded to React Native over postMessage; the
 * native side answers reads from the RPC and shows a confirmation sheet before anything is signed.
 */
export const injectedProvider = (address: string, chainIdHex: string) => `
(function () {
  if (window.__arckitInjected) return; window.__arckitInjected = true;
  var pending = {}; var nextId = 1; var listeners = {};
  function emit(ev, data) { (listeners[ev] || []).forEach(function (f) { try { f(data); } catch (e) {} }); }
  var provider = {
    isArcKit: true, isMetaMask: false, chainId: ${JSON.stringify(chainIdHex)}, selectedAddress: ${JSON.stringify(address)}, _accounts: [${JSON.stringify(address)}],
    request: function (args) {
      var method = args && args.method, params = (args && args.params) || [];
      if (method === "eth_accounts" || method === "eth_requestAccounts") { return Promise.resolve(provider._accounts.slice()); }
      if (method === "eth_chainId") return Promise.resolve(provider.chainId);
      if (method === "net_version") return Promise.resolve(String(parseInt(provider.chainId, 16)));
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
        var want = params[0] && params[0].chainId;
        if (!want || want.toLowerCase() === provider.chainId) return Promise.resolve(null);
        return Promise.reject({ code: 4902, message: "Arc Kit Wallet only supports Arc (chain 5042)." });
      }
      return new Promise(function (resolve, reject) {
        var id = nextId++; pending[id] = { resolve: resolve, reject: reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "arckit:request", id: id, method: method, params: params }));
      });
    },
    on: function (ev, f) { (listeners[ev] = listeners[ev] || []).push(f); return provider; },
    removeListener: function (ev, f) { listeners[ev] = (listeners[ev] || []).filter(function (g) { return g !== f; }); return provider; },
    removeAllListeners: function () { listeners = {}; return provider; },
    enable: function () { return provider.request({ method: "eth_requestAccounts" }); },
    send: function (a, b) { if (typeof a === "string") return provider.request({ method: a, params: b }); return provider.request(a); },
    sendAsync: function (payload, cb) { provider.request(payload).then(function (r) { cb(null, { id: payload.id, jsonrpc: "2.0", result: r }); }, function (e) { cb(e); }); },
    isConnected: function () { return true; },
  };
  window.__arckitResolve = function (msg) {
    var p = pending[msg.id]; if (!p) return; delete pending[msg.id];
    if (msg.error) p.reject(Object.assign(new Error(msg.error.message || "Request failed"), { code: msg.error.code || -32000 })); else p.resolve(msg.result);
  };
  try { Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true }); } catch (e) { window.ethereum = provider; }
  var info = { uuid: "7b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", name: "Arc Kit Wallet", icon: "https://www.usearckit.locker/icon-512.png", rdns: "locker.usearckit.wallet" };
  function announce() { window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: provider }) })); }
  window.addEventListener("eip6963:requestProvider", announce); announce();
  setTimeout(function () { emit("connect", { chainId: provider.chainId }); emit("accountsChanged", provider._accounts.slice()); }, 0);
})();
true;
`;
