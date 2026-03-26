// Toolbar icons from Figma (DTCC Atlas v.0.2.2 / Components / Navbar Sidebar)
// Stroke color uses var(--stroke-0, #5F5F6D); override --stroke-0 for active states
export const Icons = {
  // Toolbar: draw region (square with plus)
  draw: `<svg aria-hidden="true" fill="none" viewBox="0 0 35.5 37.8"><path d="M14.7 36.8H5.6C3 36.8 1 34.8 1 32.3V5.5C1 3 3 1 5.6 1h20.6c2.5 0 4.6 2 4.6 4.5v12.3M28 36V29.7M28 29.7v-6.3M28 29.7h-6.5M28 29.7h6.5" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: cancel / close (X)
  clear: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 31.3"><path d="M31 1L1 30.3M31 30.3L1 1" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Toolbar: bookmark
  bookmark: `<svg aria-hidden="true" fill="none" viewBox="0 0 26.4 34.4"><path d="M8.1 7.4h10.2M13.2 23.4l11.4 9.9c.3.3.8.1.8-.4V3c0-1.1-.9-2-2-2H3C1.9 1 1 1.9 1 3v29.9c0 .4.5.7.8.4l11.4-9.9Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: dataset / data tree
  dataTree: `<svg aria-hidden="true" fill="none" viewBox="0 0 31 38"><path d="M10 33.4c.6 0 1-.4 1-1s-.4-1-1-1v1 1ZM1 26.4H0h1Zm1-16.2V9.2H1v1h1ZM10 11.2c.6 0 1-.5 1-1s-.4-1-1-1v1 1ZM28 15v-1h-9v1 1h9v-1ZM30 1l-1 0-1 12h1 1l1-12H30ZM28 15v1c1.7 0 3-.7 3-2.3l-1 0-1 0c0 .6-.4 1-1 1v1ZM17 13h-1c0 1.7 1.3 3 3 3v-1-1c-.6 0-1-.4-1-1h-1ZM17 13h1V5h-1-1v8h1ZM21.5 1v1h8.5V1 0h-8.5v1ZM21.5 1l-.7-.7-4.5 4 .7.7.7.8 4.5-4-.7-.8ZM28 37v-1h-9v1 1h9v-1ZM30 23l-1 0-1 12h1 1l1-12H30ZM28 37v1c1.7 0 3-.7 3-2.3l-1 0-1 0c0 .6-.4 1-1 1v1ZM17 35h-1c0 1.7 1.3 3 3 3v-1-1c-.6 0-1-.4-1-1h-1ZM17 35h1V27h-1-1v8h1ZM21.5 23v1h8.5v-1-1h-8.5v1ZM21.5 23l-.7-.7-4.5 4 .7.7.7.8 4.5-4-.7-.8ZM10 32.4v-1H7v1 1h3v-1ZM1 26.4h1V10.2H1 0v16.2h1ZM1 10.2h1V1H1 0v9.2h1ZM10 10.2V9.2H1v1 1h9v-1ZM7 32.4v-1c-2.8 0-5 2.2-5 5h1 1c0-1.7 1.3-3 3-3v-1Z" fill="var(--stroke-0, #5F5F6D)"/></svg>`,

  // Toolbar: layers (stacked diamonds)
  layers: `<svg aria-hidden="true" fill="none" viewBox="0 0 37.2 37.2"><path d="M36.2 18.6l-17.6 9M36.2 27.2l-17.6 9-17.6-9M18.6 1l17.6 9-17.6 9L1 10l17.6-9Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: download
  download: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 35"><path d="M1 23.4v6.7c0 1 .4 2 1.1 2.7.7.7 1.7 1.1 2.7 1.1h22.5c1 0 1.9-.4 2.7-1.1.7-.7 1.1-1.7 1.1-2.7v-6.7M16 1v21.9M16 22.9l8.6-8.4M16 22.9l-8.6-8.4" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: upload
  upload: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 36.5"><path d="M1 24.4v7.1c0 1.1.4 2.1 1.1 2.9.7.7 1.7 1.2 2.7 1.2h22.5c1 0 1.9-.4 2.7-1.2.7-.7 1.1-1.7 1.1-2.9v-7.1M16 23.9V1M16 1L7.4 9.7M16 1l8.6 8.7" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: search (magnifier)
  search: `<svg aria-hidden="true" fill="none" viewBox="0 0 32.8 33.5"><path d="M25.4 26.2l6.4 6.3M29.7 15.7c0 8.1-6.4 14.7-14.4 14.7C7.4 30.4 1 23.8 1 15.7 1 7.6 7.4 1 15.4 1c7.9 0 14.4 6.6 14.4 14.7Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Toolbar: 3D view (cube with 3D text)
  // viewBox tightened from "0 0 50 50" to reduce internal whitespace and fix text clipping
  view3d: `<svg aria-hidden="true" fill="none" viewBox="10 4 45 41"><path d="M25.4 7.1c.2-.1.5-.1.7.1l12.2 7.3c.2.1.4.4.4.7v8.9h-1.6V13l-10.6 6.7v11.8l3.2-1.9v1.8l-3.6 2.2c-.2.1-.5.1-.8 0L13.4 26.3c-.2-.2-.4-.4-.4-.7V11.1c0-.3.2-.6.4-.7L25.4 3.1ZM14.6 25.2l10.6 6.3V19.7L14.6 13v12.2Zm.4-13.9l11 7 11-7L25.8 4.8 15 11.3Z" fill="var(--stroke-0, #5F5F6D)" transform="translate(0 4)"/><text x="35" y="42" font-family="Inter,system-ui,sans-serif" font-weight="600" font-size="13" fill="var(--stroke-0, #5F5F6D)">3D</text></svg>`,

  // Toolbar: 2D view (cube with 2D text, shown when 3D mode is active)
  // viewBox tightened from "0 0 50 50" to reduce internal whitespace and fix text clipping
  view2d: `<svg aria-hidden="true" fill="none" viewBox="10 4 45 41"><path d="M25.4 7.1c.2-.1.5-.1.7.1l12.2 7.3c.2.1.4.4.4.7v8.9h-1.6V13l-10.6 6.7v11.8l3.2-1.9v1.8l-3.6 2.2c-.2.1-.5.1-.8 0L13.4 26.3c-.2-.2-.4-.4-.4-.7V11.1c0-.3.2-.6.4-.7L25.4 3.1ZM14.6 25.2l10.6 6.3V19.7L14.6 13v12.2Zm.4-13.9l11 7 11-7L25.8 4.8 15 11.3Z" fill="var(--stroke-0, #5F5F6D)" transform="translate(0 4)"/><text x="35" y="42" font-family="Inter,system-ui,sans-serif" font-weight="600" font-size="13" fill="var(--stroke-0, #5F5F6D)">2D</text></svg>`,

  // Toolbar: chat (speech bubble)
  // viewBox expanded from "0 0 34 34" to prevent stroke clipping at edges
  chat: `<svg aria-hidden="true" fill="none" viewBox="-1 -1 36 36"><path d="M29.7 22.3c1.4-2.4 2.2-5.2 2.2-8.1C31.9 6.3 24.8 0 16 0S.1 6.3.1 14.2c0 7.9 7.1 14.2 15.9 14.2 2 0 3.8-.3 5.6-.9l8.4 3.5-2-8.5.2-.1-.5-.1Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar: hamburger menu (three horizontal lines)
  hamburger: `<svg aria-hidden="true" fill="none" viewBox="0 0 30 22"><path d="M1 1h28M1 11h28M1 21h28" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Topbar session: edit (pen)
  pen: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" stroke="var(--stroke-0, #5F5F6D)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar session: copy to clipboard
  copy: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75m11.25-3h-9.75A1.125 1.125 0 007.125 4.875v12.75c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar session: share link
  share: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Utility icons (Heroicons, used outside toolbar)
  close: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,

  arrowLeft: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>`,

  check: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`,

  trash: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`,

  chevronDown: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>`,
};
