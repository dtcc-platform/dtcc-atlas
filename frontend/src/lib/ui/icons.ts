// Toolbar icons from Figma (DTCC Atlas v.0.2.2 / Components / Navbar Sidebar)
// Stroke color uses var(--stroke-0, #5F5F6D); override --stroke-0 for active states
export const Icons = {
  // Toolbar: draw region (square with plus)
  draw: `<svg aria-hidden="true" fill="none" viewBox="0 0 35.5 37.8"><path d="M14.7 36.8H5.6C3 36.8 1 34.8 1 32.3V5.5C1 3 3 1 5.6 1h20.6c2.5 0 4.6 2 4.6 4.5v12.3M28 36V29.7M28 29.7v-6.3M28 29.7h-6.5M28 29.7h6.5" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: cancel / close (X)
  clear: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 31.3"><path d="M31 1L1 30.3M31 30.3L1 1" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Toolbar: bookmark
  bookmark: `<svg aria-hidden="true" fill="none" viewBox="0 0 26.4 34.4"><path d="M8.1 7.4h10.2M13.2 23.4l11.4 9.9c.3.3.8.1.8-.4V3c0-1.1-.9-2-2-2H3C1.9 1 1 1.9 1 3v29.9c0 .4.5.7.8.4l11.4-9.9Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: dataset / data tree (exact Figma geometry from node 42-1892)
  // viewBox padded to square aspect ratio to prevent narrow rendering in 34x34 container
  dataTree: `<svg aria-hidden="true" fill="none" viewBox="-3.5 0 38 38"><path d="M10 33.4438C10.5523 33.4438 11 32.9961 11 32.4438C11 31.8915 10.5523 31.4438 10 31.4438V32.4438V33.4438ZM1.00109 26.4441L0.00109214 26.4441L1.00109 26.4441ZM2 0.999957C1.99998 0.447672 1.55224 -2.37226e-05 0.999957 0C0.447672 2.37226e-05 -2.37226e-05 0.447758 0 1.00004L1 1L2 0.999957ZM10 11.2191C10.5523 11.2191 11 10.7714 11 10.2191C11 9.66684 10.5523 9.21913 10 9.21913V10.2191V11.2191ZM28 15L28 14V14L28 15ZM19 15L19 16V16L19 15ZM30.0003 1L31.0003 1.00002C31.0003 0.734802 30.895 0.480442 30.7074 0.292901C30.5199 0.10536 30.2655 0 30.0003 0V1ZM30 13L31 13.0001V13.0001L30 13ZM17 12.9999L16 12.9999V12.9999L17 12.9999ZM17.0001 5L16.3357 4.2526C16.1222 4.44236 16.0001 4.71436 16.0001 4.99999L17.0001 5ZM21.5 1V0C21.2551 0 21.0187 0.0898803 20.8356 0.252595L21.5 1ZM28 37L28 36V36L28 37ZM19 37L19 38V38L19 37ZM30.0003 23L31.0003 23C31.0003 22.7348 30.895 22.4804 30.7074 22.2929C30.5199 22.1054 30.2655 22 30.0003 22V23ZM30 35L31 35.0001V35.0001L30 35ZM17 34.9999L16 34.9999V34.9999L17 34.9999ZM17.0001 27L16.3357 26.2526C16.1222 26.4424 16.0001 26.7144 16.0001 27L17.0001 27ZM21.5 23V22C21.2551 22 21.0187 22.0899 20.8356 22.2526L21.5 23ZM10 32.4438V31.4438H7.00109V32.4438V33.4438H10V32.4438ZM1.00109 26.4441L2.00109 26.444L2.0004 10.2191L1.0004 10.2191L0.000395715 10.2192L0.00109214 26.4441L1.00109 26.4441ZM1.0004 10.2191L2.0004 10.2191L2 0.999957L1 1L0 1.00004L0.000395715 10.2192L1.0004 10.2191ZM10 10.2191V9.21913H1.0004V10.2191V11.2191H10V10.2191ZM7.00109 32.4438V31.4438C4.23975 31.4438 2.00121 29.2054 2.00109 26.444L1.00109 26.4441L0.00109214 26.4441C0.00125808 30.31 3.13521 33.4438 7.00109 33.4438V32.4438ZM28 15L28 14L19 14L19 15L19 16L28 16L28 15ZM30.0003 1L29.0003 0.999978L29 13L30 13L31 13.0001L31.0003 1.00002L30.0003 1ZM28 15L28 16C29.6569 16 31 14.6569 31 13.0001L30 13L29 13C29 13.5523 28.5523 14 28 14L28 15ZM17 12.9999L16 12.9999C16 14.6568 17.3431 16 19 16L19 15L19 14C18.4477 14 18 13.5522 18 13L17 12.9999ZM17 12.9999L18 13L18.0001 5.00001L17.0001 5L16.0001 4.99999L16 12.9999L17 12.9999ZM21.5 1V2H30.0003V1V0H21.5V1ZM21.5 1L20.8356 0.252595L16.3357 4.2526L17.0001 5L17.6644 5.74741L22.1644 1.7474L21.5 1ZM28 37L28 36L19 36L19 37L19 38L28 38L28 37ZM30.0003 23L29.0003 23L29 35L30 35L31 35.0001L31.0003 23L30.0003 23ZM28 37L28 38C29.6569 38 31 36.6569 31 35.0001L30 35L29 35C29 35.5523 28.5523 36 28 36L28 37ZM17 34.9999L16 34.9999C16 36.6568 17.3431 37.9999 19 38L19 37L19 36C18.4477 36 18 35.5522 18 35L17 34.9999ZM17 34.9999L18 35L18.0001 27L17.0001 27L16.0001 27L16 34.9999L17 34.9999ZM21.5 23V24H30.0003V23V22H21.5V23ZM21.5 23L20.8356 22.2526L16.3357 26.2526L17.0001 27L17.6644 27.7474L22.1644 23.7474L21.5 23Z" fill="var(--stroke-0, #5F5F6D)"/></svg>`,

  // Toolbar: layers (stacked diamonds, exact Figma geometry from node 44-1793)
  // viewBox padded by 1px on all sides to prevent stroke clipping at edges
  layers: `<svg aria-hidden="true" fill="none" viewBox="-1 -1 39.2004 39.2"><path d="M36.2002 18.5544L18.6002 27.5758L1.00021 18.5544M36.2002 27.1786L18.6002 36.2L1.00021 27.1786M18.6002 1L36.2002 10.0214L18.6002 19.0427L1.00021 10.0214L18.6002 1Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: download
  download: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 35"><path d="M1 23.4v6.7c0 1 .4 2 1.1 2.7.7.7 1.7 1.1 2.7 1.1h22.5c1 0 1.9-.4 2.7-1.1.7-.7 1.1-1.7 1.1-2.7v-6.7M16 1v21.9M16 22.9l8.6-8.4M16 22.9l-8.6-8.4" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: upload
  upload: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 36.5"><path d="M1 24.4v7.1c0 1.1.4 2.1 1.1 2.9.7.7 1.7 1.2 2.7 1.2h22.5c1 0 1.9-.4 2.7-1.2.7-.7 1.1-1.7 1.1-2.9v-7.1M16 23.9V1M16 1L7.4 9.7M16 1l8.6 8.7" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: search (magnifier)
  search: `<svg aria-hidden="true" fill="none" viewBox="0 0 32.8 33.5"><path d="M25.4 26.2l6.4 6.3M29.7 15.7c0 8.1-6.4 14.7-14.4 14.7C7.4 30.4 1 23.8 1 15.7 1 7.6 7.4 1 15.4 1c7.9 0 14.4 6.6 14.4 14.7Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Toolbar: 3D view (cube with 3D label)
  // viewBox tightened to content bounds so the icon fills the 34x34 wrapper at the
  // same visual weight as other toolbar icons. Font size increased to match.
  view3d: `<svg aria-hidden="true" fill="none" viewBox="0 0 42 40"><path d="M15.8506 0.0798727C16.142 -0.044191 16.4784 -0.0237592 16.7549 0.141396L31.9971 9.25272C32.2991 9.43326 32.4844 9.75928 32.4844 10.1111V21.2029H30.4844V12.4715L17.2422 20.909V35.6805L21.2422 33.2889V35.6199L16.7549 38.3025C16.439 38.4911 16.0443 38.4913 15.7285 38.3025L0.487305 29.1912C0.185385 29.0107 2.16293e-05 28.6846 0 28.3328V10.1111C0 9.75934 0.185399 9.43327 0.487305 9.25272L15.7285 0.141396L15.8506 0.0798727ZM2 27.7654L15.2422 35.6814V20.909L2 12.4725V27.7654ZM2.4668 10.3982C2.47098 10.4008 2.47533 10.4034 2.47949 10.406L16.2422 19.1746L30.0049 10.406C30.0086 10.4036 30.0128 10.4015 30.0166 10.3992L16.2412 2.16483L2.4668 10.3982Z" fill="var(--stroke-0, #5F5F6D)"/><text x="42" y="38" text-anchor="end" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="19" letter-spacing="-0.5" fill="var(--stroke-0, #5F5F6D)">3D</text></svg>`,

  // Toolbar: 2D view (open-corner square with 2D label)
  // viewBox tightened to content bounds so the icon fills the 34x34 wrapper at the
  // same visual weight as other toolbar icons. Font size increased to match.
  view2d: `<svg aria-hidden="true" fill="none" viewBox="0 0 42 40"><path d="M31 0C31.5523 0 32 0.447715 32 1V25H29.7002V2.2998H2.2998V29.7002H20V32H1L0.897461 31.9951C0.427034 31.9472 0.0527828 31.573 0.00488281 31.1025L0 31V1C0 0.447715 0.447715 0 1 0H31Z" fill="var(--stroke-0, #5F5F6D)"/><text x="42" y="38" text-anchor="end" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="19" letter-spacing="-0.5" fill="var(--stroke-0, #5F5F6D)">2D</text></svg>`,

  // Toolbar: chat (speech bubble)
  // viewBox expanded from "0 0 34 34" to prevent stroke clipping at edges
  chat: `<svg aria-hidden="true" fill="none" viewBox="-1 -1 36 36"><path d="M29.7 22.3c1.4-2.4 2.2-5.2 2.2-8.1C31.9 6.3 24.8 0 16 0S.1 6.3.1 14.2c0 7.9 7.1 14.2 15.9 14.2 2 0 3.8-.3 5.6-.9l8.4 3.5-2-8.5.2-.1-.5-.1Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar: hamburger menu (three horizontal lines)
  hamburger: `<svg aria-hidden="true" fill="none" viewBox="0 0 30 22"><path d="M1 1h28M1 11h28M1 21h28" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Topbar session: edit (pen)
  pen: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar session: copy to clipboard
  copy: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75m11.25-3h-9.75A1.125 1.125 0 007.125 4.875v12.75c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar session: share link
  share: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Send arrow (upward arrow for chat input)
  sendArrow: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M12 19V5M12 5l-7 7M12 5l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Utility icons (Heroicons, used outside toolbar)
  close: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,

  arrowLeft: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>`,

  check: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`,

  trash: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`,

  chevronDown: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>`,

  // Layer panel: eye open (visible layer)
  eyeOpen: `<svg aria-hidden="true" fill="none" viewBox="0 0 30 22"><path d="M1 11s5.5-10 14-10 14 10 14 10-5.5 10-14 10S1 11 1 11Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="11" r="3.5" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2"/></svg>`,

  // Layer panel: eye closed (hidden layer, with strike-through)
  eyeClosed: `<svg aria-hidden="true" fill="none" viewBox="0 0 30 22"><path d="M1 11s5.5-10 14-10 14 10 14 10-5.5 10-14 10S1 11 1 11Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20L26 2" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Layer panel: drag handle (three horizontal lines, used for reordering)
  dragHandle: `<svg aria-hidden="true" fill="none" viewBox="0 0 30 22"><path d="M1 1h28M1 11h28M1 21h28" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Layer panel: zoom to extent (crosshair/target)
  zoomExtent: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="var(--stroke-0, #5F5F6D)"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.657-5.657L15.5 8.5m-7 7l-2.157 2.157m11.314 0L15.5 15.5m-7-7L6.343 6.343M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"/></svg>`,
};
