// The chat apps re-render large parts of the page and can drop nodes they
// didn't create. Mount outside <body> and put the element back if removed.

export function mountPersistent(host) {
  const attach = () => {
    if (!host.isConnected) document.documentElement.append(host);
  };
  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true });
  // Replacing <body> wholesale doesn't touch <html>'s child list on every path.
  setInterval(attach, 1000);
}
