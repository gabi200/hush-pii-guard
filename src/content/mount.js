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

// Styles go through adoptedStyleSheets, which page CSPs don't block the way
// they can block an injected <style>. Firefox shows content scripts page
// objects through Xray wrappers, which refuse an array made on the script's
// side, so there the array is made with the page's own Array.
export function adoptStyles(root, css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  if (root.wrappedJSObject) root.wrappedJSObject.adoptedStyleSheets = window.wrappedJSObject.Array.of(sheet);
  else root.adoptedStyleSheets = [sheet];
}
