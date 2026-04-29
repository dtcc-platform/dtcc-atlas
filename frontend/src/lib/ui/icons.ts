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

  // Toolbar: simulations (three wavy horizontal lines)
  // viewBox tightened to content bounds (x:29-61, y:33.8-55.2) so icon fills wrapper at same visual weight as other toolbar icons
  simulation: `<svg aria-hidden="true" fill="none" viewBox="29 33 32 23" xmlns="http://www.w3.org/2000/svg"><path d="M30 54.1844L33.7328 52.8963C37.0308 51.7583 40.6679 52.1147 43.6762 53.8705C46.7322 55.6542 50.4343 55.9923 53.7687 54.7921L60 52.5492M30 45.3139L33.7328 44.0258C37.0308 42.8878 40.6679 43.2441 43.6762 45C46.7322 46.7837 50.4343 47.1218 53.7687 45.9216L60 43.6787M30 36.4434L33.7328 35.1553C37.0308 34.0173 40.6679 34.3736 43.6762 36.1295C46.7322 37.9132 50.4343 38.2512 53.7687 37.0511L60 34.8082" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: layers (stacked diamonds, exact Figma geometry from node 44-1793)
  // viewBox padded by 1px on all sides to prevent stroke clipping at edges
  layers: `<svg aria-hidden="true" fill="none" viewBox="-1 -1 39.2004 39.2"><path d="M36.2002 18.5544L18.6002 27.5758L1.00021 18.5544M36.2002 27.1786L18.6002 36.2L1.00021 27.1786M18.6002 1L36.2002 10.0214L18.6002 19.0427L1.00021 10.0214L18.6002 1Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: download
  download: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 35"><path d="M1 23.4v6.7c0 1 .4 2 1.1 2.7.7.7 1.7 1.1 2.7 1.1h22.5c1 0 1.9-.4 2.7-1.1.7-.7 1.1-1.7 1.1-2.7v-6.7M16 1v21.9M16 22.9l8.6-8.4M16 22.9l-8.6-8.4" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: upload
  upload: `<svg aria-hidden="true" fill="none" viewBox="0 0 32 36.5"><path d="M1 24.4v7.1c0 1.1.4 2.1 1.1 2.9.7.7 1.7 1.2 2.7 1.2h22.5c1 0 1.9-.4 2.7-1.2.7-.7 1.1-1.7 1.1-2.9v-7.1M16 23.9V1M16 1L7.4 9.7M16 1l8.6 8.7" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Toolbar: search (magnifier)
  search: `<svg aria-hidden="true" fill="none" viewBox="0 0 32.8 33.5"><path d="M25.4 26.2l6.4 6.3M29.7 15.7c0 8.1-6.4 14.7-14.4 14.7C7.4 30.4 1 23.8 1 15.7 1 7.6 7.4 1 15.4 1c7.9 0 14.4 6.6 14.4 14.7Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Toolbar: 3D view — Figma node 44:1828
  // viewBox tight on cube bbox (Figma x29-61.5, y26-64) so the cube fills the icon slot like siblings.
  // overflow=visible lets the "3D" label paint below-right of the cube.
  // Two independent transforms — tune box and label separately:
  //   BOX  group: translate/scale the cube/box only
  //   TEXT group: translate/scale the "3D" daughter label only
  // fill-rule=evenodd on the cube subtracts the inner cube faces (otherwise it renders solid).
  view3d: `<svg aria-hidden="true" fill="none" viewBox="28 28 34 34" overflow="visible"><g transform="translate(4.525 4.515) scale(0.9)"><path fill-rule="evenodd" clip-rule="evenodd" d="M44.8506 26.0801C45.142 25.956 45.4784 25.9764 45.7549 26.1416L60.9971 35.2529C61.2991 35.4335 61.4844 35.7595 61.4844 36.1113V47.2031H59.4844V38.4717L46.2422 46.9092V61.6807L50.2422 59.2891V61.6201L45.7549 64.3027C45.439 64.4913 45.0443 64.4915 44.7285 64.3027L29.4873 55.1914C29.1854 55.0109 29 54.6848 29 54.333V36.1113C29 35.7595 29.1854 35.4335 29.4873 35.2529L44.7285 26.1416L44.8506 26.0801ZM31 53.7656L44.2422 61.6816V46.9092L31 38.4727V53.7656ZM31.4668 36.3984C31.471 36.401 31.4753 36.4036 31.4795 36.4062L45.2422 45.1748L59.0049 36.4062C59.0086 36.4039 59.0128 36.4017 59.0166 36.3994L45.2412 28.165L31.4668 36.3984Z" fill="var(--stroke-0, #5F5F6D)"/></g><g transform="translate(0 0) scale(1)"><path d="M54.3746 59.8163C53.5564 59.8163 52.8291 59.6762 52.1928 59.3959C51.5602 59.1156 51.0602 58.7254 50.6928 58.2254C50.3254 57.7254 50.1303 57.1478 50.1076 56.4925H52.2439C52.2629 56.8068 52.367 57.0815 52.5564 57.3163C52.7458 57.5474 52.9977 57.7273 53.3121 57.8561C53.6265 57.9849 53.9788 58.0493 54.3689 58.0493C54.7856 58.0493 55.1549 57.9773 55.4769 57.8334C55.7988 57.6856 56.0507 57.4811 56.2326 57.2197C56.4144 56.9584 56.5034 56.6572 56.4996 56.3163C56.5034 55.964 56.4125 55.6534 56.2269 55.3845C56.0413 55.1156 55.7723 54.9053 55.4201 54.7538C55.0716 54.6023 54.6511 54.5265 54.1587 54.5265H53.1303V52.9015H54.1587C54.564 52.9015 54.9182 52.8315 55.2212 52.6913C55.528 52.5512 55.7685 52.3542 55.9428 52.1004C56.117 51.8428 56.2023 51.5455 56.1985 51.2084C56.2023 50.8788 56.1284 50.5928 55.9769 50.3504C55.8291 50.1042 55.6189 49.9129 55.3462 49.7765C55.0773 49.6402 54.761 49.572 54.3973 49.572C54.0413 49.572 53.7117 49.6364 53.4087 49.7652C53.1057 49.894 52.8613 50.0777 52.6757 50.3163C52.4901 50.5512 52.3916 50.8315 52.3803 51.1572H50.3519C50.367 50.5057 50.5545 49.9337 50.9144 49.4413C51.278 48.9451 51.7629 48.5587 52.3689 48.2822C52.975 48.0019 53.6549 47.8618 54.4087 47.8618C55.1852 47.8618 55.8595 48.0076 56.4314 48.2993C57.0072 48.5872 57.4523 48.9754 57.7666 49.464C58.081 49.9527 58.2382 50.4925 58.2382 51.0834C58.242 51.7387 58.0488 52.2879 57.6587 52.7311C57.2723 53.1743 56.7648 53.464 56.136 53.6004V53.6913C56.9541 53.805 57.581 54.108 58.0166 54.6004C58.456 55.089 58.6738 55.697 58.6701 56.4243C58.6701 57.0758 58.4845 57.6591 58.1132 58.1743C57.7458 58.6856 57.2382 59.0872 56.5905 59.3788C55.9466 59.6705 55.2079 59.8163 54.3746 59.8163ZM64.4972 59.6572H60.554V48.0209H64.5767C65.732 48.0209 66.7244 48.2538 67.554 48.7197C68.3873 49.1818 69.0275 49.8466 69.4744 50.714C69.9214 51.5815 70.1449 52.6193 70.1449 53.8277C70.1449 55.0398 69.9195 56.0815 69.4688 56.9527C69.0218 57.8239 68.3759 58.4925 67.5312 58.9584C66.6903 59.4243 65.679 59.6572 64.4972 59.6572ZM62.6619 57.8334H64.3949C65.2055 57.8334 65.8816 57.6856 66.4233 57.3902C66.965 57.0909 67.3722 56.6459 67.6449 56.055C67.9176 55.4603 68.054 54.7178 68.054 53.8277C68.054 52.9375 67.9176 52.1989 67.6449 51.6118C67.3722 51.0209 66.9688 50.5796 66.4347 50.2879C65.9044 49.9925 65.2453 49.8447 64.4574 49.8447H62.6619V57.8334Z" fill="var(--stroke-0, #5F5F6D)"/></g></svg>`,

  // Toolbar: 2D view — Figma node 44:1853
  // viewBox tight on bracket bbox (Figma x29-61, y29-61). overflow=visible so the "2D" label below-right paints fully.
  // Two independent transforms — tune box and label separately:
  //   BOX  group: translate/scale the bracket/square only
  //   TEXT group: translate/scale the "2D" daughter label only
  view2d: `<svg aria-hidden="true" fill="none" viewBox="28 28 34 34" overflow="visible"><g transform="translate(9 9) scale(0.8)"><path d="M60 29C60.5523 29 61 29.4477 61 30V54H58.7002V31.2998H31.2998V58.7002H49V61H30L29.8975 60.9951C29.427 60.9472 29.0528 60.573 29.0049 60.1025L29 60V30C29 29.4477 29.4477 29 30 29H60Z" fill="var(--stroke-0, #5F5F6D)"/></g><g transform="translate(0 0) scale(1)"><path d="M50.6828 67V65.4773L54.7226 61.517C55.109 61.1269 55.4309 60.7803 55.6885 60.4773C55.9461 60.1742 56.1393 59.8807 56.2681 59.5966C56.3969 59.3125 56.4613 59.0095 56.4613 58.6875C56.4613 58.3201 56.3779 58.0057 56.2113 57.7443C56.0446 57.4792 55.8154 57.2746 55.5238 57.1307C55.2321 56.9867 54.9006 56.9148 54.5294 56.9148C54.1469 56.9148 53.8116 56.9943 53.5238 57.1534C53.2359 57.3087 53.0124 57.5303 52.8533 57.8182C52.698 58.1061 52.6203 58.4489 52.6203 58.8466H50.6147C50.6147 58.108 50.7832 57.4659 51.1203 56.9205C51.4575 56.375 51.9215 55.9527 52.5124 55.6534C53.1071 55.3542 53.7889 55.2045 54.5578 55.2045C55.3381 55.2045 56.0238 55.3504 56.6147 55.642C57.2056 55.9337 57.6639 56.3333 57.9897 56.8409C58.3192 57.3485 58.484 57.928 58.484 58.5795C58.484 59.0152 58.4006 59.4432 58.234 59.8636C58.0673 60.2841 57.7738 60.75 57.3533 61.2614C56.9366 61.7727 56.3514 62.392 55.5976 63.1193L53.5919 65.1591V65.2386H58.6601V67H50.6828ZM64.4972 67H60.554V55.3636H64.5767C65.732 55.3636 66.7244 55.5966 67.554 56.0625C68.3873 56.5246 69.0275 57.1894 69.4744 58.0568C69.9214 58.9242 70.1449 59.9621 70.1449 61.1705C70.1449 62.3826 69.9195 63.4242 69.4688 64.2955C69.0218 65.1667 68.3759 65.8352 67.5312 66.3011C66.6903 66.767 65.679 67 64.4972 67ZM62.6619 65.1761H64.3949C65.2055 65.1761 65.8816 65.0284 66.4233 64.733C66.965 64.4337 67.3722 63.9886 67.6449 63.3977C67.9176 62.803 68.054 62.0606 68.054 61.1705C68.054 60.2803 67.9176 59.5417 67.6449 58.9545C67.3722 58.3636 66.9688 57.9223 66.4347 57.6307C65.9044 57.3352 65.2453 57.1875 64.4574 57.1875H62.6619V65.1761Z" fill="var(--stroke-0, #5F5F6D)"/></g></svg>`,

  // Toolbar: chat (speech bubble)
  // viewBox expanded from "0 0 34 34" to prevent stroke clipping at edges
  chat: `<svg aria-hidden="true" fill="none" viewBox="-1 -1 36 36"><path d="M29.7 22.3c1.4-2.4 2.2-5.2 2.2-8.1C31.9 6.3 24.8 0 16 0S.1 6.3.1 14.2c0 7.9 7.1 14.2 15.9 14.2 2 0 3.8-.3 5.6-.9l8.4 3.5-2-8.5.2-.1-.5-.1Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar: hamburger menu (three horizontal lines)
  hamburger: `<svg aria-hidden="true" fill="none" viewBox="0 0 30 22"><path d="M1 1h28M1 11h28M1 21h28" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round"/></svg>`,

  // Topbar session: edit (pen)
  pen: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // Topbar session: copy — spec package path, viewBox tightened to path bounds (x31-60, y28-62)
  copy: `<svg aria-hidden="true" fill="none" viewBox="31 28 29 34"><path d="M58.333 46.8752L58.333 33C58.333 31.3432 56.9898 30 55.333 30L41.458 30.0002M48.333 60.0002L37.083 60.0002C35.0119 60.0002 33.333 58.3213 33.333 56.2502L33.333 40.0002C33.333 37.9291 35.0119 36.2502 37.083 36.2502L48.333 36.2502C50.4041 36.2502 52.083 37.9291 52.083 40.0002L52.083 56.2502C52.083 58.3213 50.4041 60.0002 48.333 60.0002Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2.8" stroke-linecap="round"/></svg>`,

  // Topbar session: share — spec package path (forward-arrow), viewBox tightened to path bounds (x28-62, y32-59)
  share: `<svg aria-hidden="true" fill="none" viewBox="28 32 34 27"><path d="M60.0003 44.5984L44.0003 34L44.0003 40C30 43 30 57 30 57C30 57 36 49 44.0003 50L44.0003 56.2L60.0003 44.5984Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2.3" stroke-linejoin="round"/></svg>`,

  // Topbar session: user profile — viewBox tightened to path bounds (x30-60, y31-58) so icon fills render box at same visual weight as copy/share
  user: `<svg aria-hidden="true" fill="none" viewBox="30 31 30 27"><path d="M32 56.1364C33.956 52.8739 38.2429 50.641 44.931 50.641C51.6192 50.641 55.9061 52.8739 57.8621 56.1364M50.2438 39.3127C50.2438 42.2469 47.8652 44.6255 44.931 44.6255C41.9969 44.6255 39.6183 42.2469 39.6183 39.3127C39.6183 36.3786 41.9969 34 44.931 34C47.8652 34 50.2438 36.3786 50.2438 39.3127Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2.3" stroke-linecap="round"/></svg>`,

  // Topbar session: edit pencil — viewBox tightened to path bounds (x30-60, y30-60) so icon fills render box at same visual weight as copy/share
  edit: `<svg aria-hidden="true" fill="none" viewBox="30 30 30 30"><path fill-rule="evenodd" clip-rule="evenodd" d="M51.0125 32.7071C51.4028 32.3165 52.0358 32.3163 52.4265 32.7065L57.2922 37.5667C57.683 37.9571 57.6833 38.5904 57.2928 38.9811L40.0826 56.2007C39.9433 56.3401 39.766 56.4352 39.5728 56.4741L32 58L33.5286 50.4364C33.5675 50.2436 33.6624 50.0666 33.8015 49.9275L51.0125 32.7071Z" stroke="var(--stroke-0, #5F5F6D)" stroke-width="2.3" stroke-linejoin="round"/></svg>`,

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
