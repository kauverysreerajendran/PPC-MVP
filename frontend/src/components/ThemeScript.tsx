/* eslint-disable react/no-danger -- static inline string, runs before paint to prevent theme flash */

const SNIPPET =
  "try{var t=localStorage.getItem('titan.theme');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t);}catch(e){}";

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SNIPPET }} />;
}
