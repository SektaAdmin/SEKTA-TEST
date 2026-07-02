# Geist Design Tokens

> Автозгенеровано з CSS-бандлів Geist (`Vercel_raw/geist-docs`) скриптом `scripts/geist/extract-tokens.mjs` (`npm run geist:tokens`).
> Значення light/dark. `var(--x)` = аліас на інший токен. lab()/oklch()-дублікати відкинуто на користь hex.
> **Не редагувати вручну** — перегенерувати зі скрипта.

**Джерело:** 3 CSS-файли, 405 унікальних токенів.

## typography

| Токен | Light | Dark |
|---|---|---|
| `--default-font-family` | `var(--font-geist-sans)` | — |
| `--default-mono-font-family` | `var(--font-mono)` | — |
| `--leading-normal` | `1.5` | — |
| `--text-base` | `1rem` | — |
| `--text-base--line-height` | `calc(1.5 / 1)` | — |
| `--text-lg` | `1.125rem` | — |
| `--text-lg--line-height` | `calc(1.75 / 1.125)` | — |
| `--text-sm` | `.875rem` | — |
| `--text-sm--line-height` | `calc(1.25 / .875)` | — |
| `--text-xl` | `1.25rem` | — |
| `--text-xl--line-height` | `calc(1.75 / 1.25)` | — |
| `--text-xs` | `.75rem` | — |
| `--text-xs--line-height` | `calc(1 / .75)` | — |
| `--tracking-normal` | `0em` | — |

## spacing

| Токен | Light | Dark |
|---|---|---|
| `--geist-gap` | `var(--geist-space-gap)` | — |
| `--geist-gap-double` | `var(--geist-space-large)` | — |
| `--geist-gap-double-negative` | `var(--geist-space-large-negative)` | — |
| `--geist-gap-half` | `var(--geist-space-gap-half)` | — |
| `--geist-gap-half-negative` | `var(--geist-space-gap-half-negative)` | — |
| `--geist-gap-negative` | `var(--geist-space-gap-negative)` | — |
| `--geist-gap-quarter` | `var(--geist-space-gap-quarter)` | — |
| `--geist-gap-quarter-negative` | `var(--geist-space-gap-quarter-negative)` | — |
| `--geist-gap-section` | `var(--geist-space-small)` | — |
| `--geist-space` | `4px` | — |
| `--geist-space-2x` | `8px` | — |
| `--geist-space-2x-negative` | `-8px` | — |
| `--geist-space-3x` | `12px` | — |
| `--geist-space-4x` | `16px` | — |
| `--geist-space-4x-negative` | `-16px` | — |
| `--geist-space-6x` | `24px` | — |
| `--geist-space-8x` | `32px` | — |
| `--geist-space-8x-negative` | `-32px` | — |
| `--geist-space-10x` | `40px` | — |
| `--geist-space-16x` | `64px` | — |
| `--geist-space-16x-negative` | `-64px` | — |
| `--geist-space-24x` | `96px` | — |
| `--geist-space-24x-negative` | `-96px` | — |
| `--geist-space-32x` | `128px` | — |
| `--geist-space-32x-negative` | `-128px` | — |
| `--geist-space-48x` | `192px` | — |
| `--geist-space-48x-negative` | `-192px` | — |
| `--geist-space-64x` | `256px` | — |
| `--geist-space-64x-negative` | `-256px` | — |
| `--geist-space-gap` | `24px` | — |
| `--geist-space-gap-half` | `12px` | — |
| `--geist-space-gap-half-negative` | `-12px` | — |
| `--geist-space-gap-negative` | `-24px` | — |
| `--geist-space-gap-quarter` | `var(--geist-space-2x)` | — |
| `--geist-space-gap-quarter-negative` | `var(--geist-space-2x-negative)` | — |
| `--geist-space-large` | `48px` | — |
| `--geist-space-large-negative` | `-48px` | — |
| `--geist-space-medium` | `40px` | — |
| `--geist-space-medium-negative` | `-40px` | — |
| `--geist-space-negative` | `-4px` | — |
| `--geist-space-small` | `32px` | — |
| `--geist-space-small-negative` | `-32px` | — |

## radius

| Токен | Light | Dark |
|---|---|---|
| `--geist-marketing-radius` | `8px` | — |
| `--geist-radius` | `6px` | — |
| `--radius-3xl` | `1.5rem` | — |
| `--radius-md` | `.375rem` | — |

## shadow

| Токен | Light | Dark |
|---|---|---|
| `--ds-shadow-2xl` | `0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f` | `0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f` |
| `--ds-shadow-2xs` | `0px 1px 1px #0000000a` | `0px 1px 1px #00000029` |
| `--ds-shadow-background-border` | `0 0 0 1px var(--ds-background-200)` | `0 0 0 1px var(--ds-background-200)` |
| `--ds-shadow-border` | `var(--ds-shadow-border-base), var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), var(--ds-shadow-background-border)` |
| `--ds-shadow-border-base` | `0 0 0 1px #00000014` | `0 0 0 1px #ffffff25` |
| `--ds-shadow-border-inset` | `inset 0 0 0 1px #00000014` | `inset 0 0 0 1px #ffffff1a` |
| `--ds-shadow-border-large` | `var(--ds-shadow-border-base), var(--ds-shadow-large), var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), var(--ds-shadow-large), var(--ds-shadow-background-border)` |
| `--ds-shadow-border-medium` | `var(--ds-shadow-border-base), var(--ds-shadow-medium), var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), var(--ds-shadow-medium), var(--ds-shadow-background-border)` |
| `--ds-shadow-border-small` | `var(--ds-shadow-border-base), var(--ds-shadow-small), var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), var(--ds-shadow-small), var(--ds-shadow-background-border)` |
| `--ds-shadow-fullscreen` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f, var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f, var(--ds-shadow-background-border)` |
| `--ds-shadow-large` | `0px 2px 2px #0000000a, 0px 8px 16px -4px #0000000a` | `0px 2px 2px #0000000a, 0px 8px 16px -4px #0000000a` |
| `--ds-shadow-medium` | `0px 2px 2px #0000000a, 0px 8px 8px -8px #0000000a` | `0px 2px 2px #00000052, 0px 8px 8px -8px #00000029` |
| `--ds-shadow-menu` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 4px 8px -4px #0000000a, 0px 16px 24px -8px #0000000f, var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 4px 8px -4px #0000000a, 0px 16px 24px -8px #0000000f, var(--ds-shadow-background-border)` |
| `--ds-shadow-modal` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f, var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f, var(--ds-shadow-background-border)` |
| `--ds-shadow-small` | `0px 2px 2px #0000000a` | `0px 1px 2px #00000029` |
| `--ds-shadow-tooltip` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 4px 8px #0000000a, var(--ds-shadow-background-border)` | `var(--ds-shadow-border-base), 0px 1px 1px #00000005, 0px 4px 8px #0000000a, var(--ds-shadow-background-border)` |
| `--ds-shadow-xl` | `0px 1px 1px #00000005, 0px 4px 8px -4px #0000000a, 0px 16px 24px -8px #0000000f` | `0px 1px 1px #00000005, 0px 4px 8px -4px #0000000a, 0px 16px 24px -8px #0000000f` |
| `--ds-shadow-xs` | `0px 1px 2px #0000000a` | `0px 1px 2px #00000029` |

## layout & breakpoints

| Токен | Light | Dark |
|---|---|---|
| `--blur-sm` | `8px` | — |
| `--breakpoint-lg` | `961px` | — |

## focus ring

| Токен | Light | Dark |
|---|---|---|
| `--ds-focus-border` | `0 0 0 1px var(--ds-gray-alpha-600), 0px 0px 0px 4px #00000029` | `0 0 0 1px var(--ds-gray-alpha-600), 0px 0px 0px 4px #ffffff3d` |
| `--ds-focus-color` | `var(--ds-blue-700)` | `var(--ds-blue-900)` |
| `--ds-focus-ring` | `0 0 0 2px var(--ds-background-100), 0 0 0 4px var(--ds-focus-color)` | `0 0 0 2px var(--ds-background-100), 0 0 0 4px var(--ds-focus-color)` |
| `--ds-focus-ring-outline` | `2px solid var(--ds-focus-color)` | — |

## motion

| Токен | Light | Dark |
|---|---|---|
| `--animate-blink` | `blink 1.4s infinite both` | — |
| `--animate-cmdkFadeIn` | `cmdkFadeIn var(--ds-motion-overlay-duration) var(--ds-motion-overlay-timing)` | — |
| `--animate-cmdkFadeOut` | `cmdkFadeOut var(--ds-motion-overlay-duration) var(--ds-motion-overlay-timing)` | — |
| `--animate-cmdkLoading` | `cmdkLoading 1.1s cubic-bezier(.455, .03, .515, .955) infinite` | — |
| `--animate-cmdkScaleIn` | `cmdkScaleIn var(--ds-motion-overlay-duration) var(--ds-motion-overlay-timing)` | — |
| `--animate-cmdkScaleOut` | `cmdkScaleOut var(--ds-motion-overlay-duration) var(--ds-motion-overlay-timing)` | — |
| `--animate-fadeInTooltip` | `fadeInTooltip .1s ease-in .4s forwards` | — |
| `--animate-fadeInTooltipFaster` | `fadeInTooltip .1s ease-in .1s forwards` | — |
| `--animate-fadeOutPopover` | `fadeOut var(--ds-motion-popover-timing) var(--ds-motion-popover-duration)` | — |
| `--animate-feedbackAppear` | `feedbackAppear .5s .1s ease forwards` | — |
| `--animate-feedbackFadeIn` | `feedbackFadeIn .1s cubic-bezier(.16, 1, .3, 1)` | — |
| `--animate-feedbackFadeOut` | `feedbackFadeOut .2s cubic-bezier(.16, 1, .3, 1) forwards` | — |
| `--animate-loading` | `loading 8s ease-in-out infinite` | — |
| `--animate-loading-skeleton` | `loading-skeleton 1.5s ease-in-out infinite reverse` | — |
| `--default-transition-duration` | `.15s` | — |
| `--default-transition-timing-function` | `cubic-bezier(.4, 0, .2, 1)` | — |
| `--ds-motion-overlay-duration` | `.3s` | — |
| `--ds-motion-overlay-scale` | `.96` | — |
| `--ds-motion-overlay-timing` | `var(--ds-motion-timing-swift)` | — |
| `--ds-motion-popover-duration` | `.2s` | — |
| `--ds-motion-popover-timing` | `var(--ds-motion-timing-swift)` | — |
| `--ds-motion-timing-swift` | `cubic-bezier(.175, .885, .32, 1.1)` | — |

## surfaces & contrast

| Токен | Light | Dark |
|---|---|---|
| `--ds-background-100` | `#fff` | `#000` |
| `--ds-background-100-value` | `0, 0%, 100%` | `0, 0%, 4%` |
| `--ds-background-200` | `#fafafa` | `#000` |
| `--ds-background-200-value` | `0, 0%, 98%` | `0, 0%, 0%` |
| `--ds-black` | `#000` | — |
| `--ds-contrast-fg` | `#fff` | — |
| `--ds-overlay-backdrop-color` | `var(--ds-background-200)` | — |
| `--ds-overlay-backdrop-opacity` | `.8` | — |
| `--ds-page-width` | `1400px` | — |
| `--ds-page-width-with-margin` | `calc(var(--ds-page-width) + calc(2 * var(--geist-page-margin)))` | — |
| `--ds-white` | `#fff` | — |

## color · gray

| Токен | Light | Dark |
|---|---|---|
| `--ds-gray-100` | `#f2f2f2` | `#1a1a1a` |
| `--ds-gray-100-value` | `0, 0%, 95%` | `0, 0%, 10%` |
| `--ds-gray-200` | `#ebebeb` | `#1f1f1f` |
| `--ds-gray-200-value` | `0, 0%, 92%` | `0, 0%, 12%` |
| `--ds-gray-300` | `#e6e6e6` | `#292929` |
| `--ds-gray-300-value` | `0, 0%, 90%` | `0, 0%, 16%` |
| `--ds-gray-400` | `#eaeaea` | `#2e2e2e` |
| `--ds-gray-400-value` | `0, 0%, 92%` | `0, 0%, 18%` |
| `--ds-gray-500` | `#c9c9c9` | `#454545` |
| `--ds-gray-500-value` | `0, 0%, 79%` | `0, 0%, 27%` |
| `--ds-gray-600` | `#a8a8a8` | `#878787` |
| `--ds-gray-600-value` | `0, 0%, 66%` | `0, 0%, 53%` |
| `--ds-gray-700` | `#8f8f8f` | `#8f8f8f` |
| `--ds-gray-700-value` | `0, 0%, 56%` | `0, 0%, 56%` |
| `--ds-gray-800` | `#7d7d7d` | `#7d7d7d` |
| `--ds-gray-800-value` | `0, 0%, 49%` | `0, 0%, 49%` |
| `--ds-gray-900` | `#4d4d4d` | `#a0a0a0` |
| `--ds-gray-900-value` | `0, 0%, 30%` | `0, 0%, 63%` |
| `--ds-gray-1000` | `#171717` | `#ededed` |
| `--ds-gray-1000-value` | `0, 0%, 9%` | `0, 0%, 93%` |

## color · gray (alpha)

| Токен | Light | Dark |
|---|---|---|
| `--ds-gray-alpha-100` | `#0000000d` | `#ffffff12` |
| `--ds-gray-alpha-200` | `#00000015` | `#ffffff17` |
| `--ds-gray-alpha-300` | `#0000001a` | `#ffffff21` |
| `--ds-gray-alpha-400` | `#00000014` | `#ffffff24` |
| `--ds-gray-alpha-500` | `#00000036` | `#ffffff3d` |
| `--ds-gray-alpha-600` | `#0000003d` | `#ffffff82` |
| `--ds-gray-alpha-700` | `#00000070` | `#ffffff8a` |
| `--ds-gray-alpha-800` | `#00000082` | `#ffffff78` |
| `--ds-gray-alpha-900` | `#000000b3` | `#ffffff9c` |
| `--ds-gray-alpha-1000` | `#000000e8` | `#ffffffeb` |

## color · blue

| Токен | Light | Dark |
|---|---|---|
| `--ds-blue-100` | `#f0f7ff` | `#06193a` |
| `--ds-blue-100-value` | `212, 100%, 97%` | `216, 50%, 12%` |
| `--ds-blue-200` | `#eaf4ff` | `#022248` |
| `--ds-blue-200-value` | `210, 100%, 96%` | `214, 59%, 15%` |
| `--ds-blue-300` | `#e0efff` | `#002f62` |
| `--ds-blue-300-value` | `210, 100%, 94%` | `213, 71%, 20%` |
| `--ds-blue-400` | `#cce7ff` | `#003771` |
| `--ds-blue-400-value` | `209, 100%, 90%` | `212, 78%, 23%` |
| `--ds-blue-500` | `#97ccff` | `#004287` |
| `--ds-blue-500-value` | `209, 100%, 80%` | `211, 86%, 27%` |
| `--ds-blue-600` | `#51aeff` | `#0090ff` |
| `--ds-blue-600-value` | `208, 100%, 66%` | `206, 100%, 50%` |
| `--ds-blue-700` | `#0070f7` | `#0071f6` |
| `--ds-blue-700-value` | `212, 100%, 48%` | `212, 100%, 48%` |
| `--ds-blue-800` | `#005edc` | `#005fd8` |
| `--ds-blue-800-value` | `212, 100%, 41%` | `212, 100%, 41%` |
| `--ds-blue-900` | `#0064e2` | `#50a8ff` |
| `--ds-blue-900-value` | `211, 100%, 42%` | `210, 100%, 66%` |
| `--ds-blue-1000` | `#002453` | `#ebf6ff` |
| `--ds-blue-1000-value` | `211, 100%, 15%` | `206, 100%, 96%` |

## color · red

| Токен | Light | Dark |
|---|---|---|
| `--ds-red-100` | `#ffeef0` | `#330a11` |
| `--ds-red-100-value` | `0, 100%, 97%` | `357, 37%, 12%` |
| `--ds-red-200` | `#ffe9ea` | `#440d13` |
| `--ds-red-200-value` | `0, 100%, 96%` | `357, 46%, 16%` |
| `--ds-red-300` | `#ffe4e5` | `#5d0e17` |
| `--ds-red-300-value` | `0, 100%, 95%` | `356, 54%, 22%` |
| `--ds-red-400` | `#ffd8d7` | `#6f101b` |
| `--ds-red-400-value` | `0, 90%, 92%` | `357, 55%, 26%` |
| `--ds-red-500` | `#ffb5b6` | `#88151f` |
| `--ds-red-500-value` | `0, 82%, 85%` | `357, 60%, 32%` |
| `--ds-red-600` | `#ff6a6e` | `#f32e40` |
| `--ds-red-600-value` | `359, 90%, 71%` | `358, 75%, 59%` |
| `--ds-red-700` | `#fc0035` | `#f13242` |
| `--ds-red-700-value` | `358, 75%, 59%` | `358, 75%, 59%` |
| `--ds-red-800` | `#e70022` | `#e2162a` |
| `--ds-red-800-value` | `358, 70%, 52%` | `358, 69%, 52%` |
| `--ds-red-900` | `#d60020` | `#ff5e63` |
| `--ds-red-900-value` | `358, 66%, 48%` | `358, 100%, 69%` |
| `--ds-red-1000` | `#46000c` | `#ffeaed` |
| `--ds-red-1000-value` | `355, 49%, 15%` | `353, 90%, 96%` |

## color · amber

| Токен | Light | Dark |
|---|---|---|
| `--ds-amber-100` | `#fff6e1` | `#291800` |
| `--ds-amber-100-value` | `39, 100%, 95%` | `35, 100%, 8%` |
| `--ds-amber-200` | `#fff4d4` | `#331b00` |
| `--ds-amber-200-value` | `44, 100%, 92%` | `32, 100%, 10%` |
| `--ds-amber-300` | `#fff1c8` | `#4f2900` |
| `--ds-amber-300-value` | `43, 96%, 90%` | `33, 100%, 15%` |
| `--ds-amber-400` | `#ffdd84` | `#573200` |
| `--ds-amber-400-value` | `42, 100%, 78%` | `35, 100%, 17%` |
| `--ds-amber-500` | `#ffc85e` | `#6c4100` |
| `--ds-amber-500-value` | `38, 100%, 71%` | `35, 91%, 22%` |
| `--ds-amber-600` | `#fa0` | `#e99c00` |
| `--ds-amber-600-value` | `36, 90%, 62%` | `39, 85%, 49%` |
| `--ds-amber-700` | `#ffb200` | `#ffb200` |
| `--ds-amber-700-value` | `39, 100%, 57%` | `39, 100%, 57%` |
| `--ds-amber-800` | `#f90` | `#f90` |
| `--ds-amber-800-value` | `35, 100%, 52%` | `35, 100%, 52%` |
| `--ds-amber-900` | `#a64f00` | `#f90` |
| `--ds-amber-900-value` | `30, 100%, 32%` | `39, 90%, 50%` |
| `--ds-amber-1000` | `#541c00` | `#fff3d9` |
| `--ds-amber-1000-value` | `20, 79%, 17%` | `40, 94%, 93%` |

## color · green

| Токен | Light | Dark |
|---|---|---|
| `--ds-green-100` | `#ecfdec` | `#00250a` |
| `--ds-green-100-value` | `120, 60%, 96%` | `136, 50%, 9%` |
| `--ds-green-200` | `#e5fce7` | `#003110` |
| `--ds-green-200-value` | `120, 60%, 95%` | `137, 50%, 12%` |
| `--ds-green-300` | `#d3fad1` | `#003814` |
| `--ds-green-300-value` | `120, 60%, 91%` | `136, 50%, 14%` |
| `--ds-green-400` | `#b9f5bc` | `#004616` |
| `--ds-green-400-value` | `122, 60%, 86%` | `135, 70%, 16%` |
| `--ds-green-500` | `#82eb8d` | `#00661d` |
| `--ds-green-500-value` | `124, 60%, 75%` | `135, 70%, 23%` |
| `--ds-green-600` | `#4ce15e` | `#009431` |
| `--ds-green-600-value` | `125, 60%, 64%` | `135, 70%, 34%` |
| `--ds-green-700` | `#28a948` | `#00ab3e` |
| `--ds-green-700-value` | `131, 41%, 46%` | `131, 41%, 46%` |
| `--ds-green-800` | `#279141` | `#009335` |
| `--ds-green-800-value` | `132, 43%, 39%` | `132, 43%, 39%` |
| `--ds-green-900` | `#107d32` | `#00ca52` |
| `--ds-green-900-value` | `133, 50%, 32%` | `131, 43%, 57%` |
| `--ds-green-1000` | `#00370d` | `#daffe5` |
| `--ds-green-1000-value` | `128, 29%, 15%` | `136, 73%, 94%` |

## color · purple

| Токен | Light | Dark |
|---|---|---|
| `--ds-purple-100` | `#f9f0ff` | `#290c33` |
| `--ds-purple-100-value` | `276, 100%, 97%` | `283, 30%, 12%` |
| `--ds-purple-200` | `#f9f1ff` | `#341142` |
| `--ds-purple-200-value` | `277, 87%, 97%` | `281, 38%, 16%` |
| `--ds-purple-300` | `#f5e8ff` | `#47185e` |
| `--ds-purple-300-value` | `274, 78%, 95%` | `279, 44%, 23%` |
| `--ds-purple-400` | `#f1d9ff` | `#541a76` |
| `--ds-purple-400-value` | `276, 71%, 92%` | `277, 46%, 28%` |
| `--ds-purple-500` | `#dda9ff` | `#642290` |
| `--ds-purple-500-value` | `274, 70%, 82%` | `274, 49%, 35%` |
| `--ds-purple-600` | `#c77dff` | `#9440d5` |
| `--ds-purple-600-value` | `273, 72%, 73%` | `272, 51%, 54%` |
| `--ds-purple-700` | `#9f00f4` | `#9440d5` |
| `--ds-purple-700-value` | `272, 51%, 54%` | `272, 51%, 54%` |
| `--ds-purple-800` | `#8400cd` | `#7d2bba` |
| `--ds-purple-800-value` | `272, 47%, 45%` | `272, 47%, 45%` |
| `--ds-purple-900` | `#7c00c9` | `#c472fb` |
| `--ds-purple-900-value` | `274, 71%, 43%` | `275, 80%, 71%` |
| `--ds-purple-1000` | `#2e004d` | `#faedff` |
| `--ds-purple-1000-value` | `276, 100%, 15%` | `281, 73%, 96%` |

## color · teal

| Токен | Light | Dark |
|---|---|---|
| `--ds-teal-100` | `#dffffb` | `#00211b` |
| `--ds-teal-100-value` | `169, 70%, 96%` | `169, 78%, 7%` |
| `--ds-teal-200` | `#ddfef6` | `#002922` |
| `--ds-teal-200-value` | `167, 70%, 94%` | `170, 74%, 9%` |
| `--ds-teal-300` | `#ccf9f1` | `#003b33` |
| `--ds-teal-300-value` | `168, 70%, 90%` | `171, 75%, 13%` |
| `--ds-teal-400` | `#b1f7ec` | `#003f35` |
| `--ds-teal-400-value` | `170, 70%, 85%` | `171, 85%, 13%` |
| `--ds-teal-500` | `#52f0db` | `#005f53` |
| `--ds-teal-500-value` | `170, 70%, 72%` | `172, 85%, 20%` |
| `--ds-teal-600` | `#00e2c4` | `#009885` |
| `--ds-teal-600-value` | `170, 70%, 57%` | `172, 85%, 32%` |
| `--ds-teal-700` | `#00a694` | `#00a794` |
| `--ds-teal-700-value` | `173, 80%, 36%` | `173, 80%, 36%` |
| `--ds-teal-800` | `#008d7d` | `#008d7d` |
| `--ds-teal-800-value` | `173, 83%, 30%` | `173, 83%, 30%` |
| `--ds-teal-900` | `#007a6e` | `#00c9b5` |
| `--ds-teal-900-value` | `174, 91%, 25%` | `174, 90%, 41%` |
| `--ds-teal-1000` | `#003d34` | `#cefff5` |
| `--ds-teal-1000-value` | `171, 80%, 13%` | `166, 71%, 93%` |

## color · pink

| Токен | Light | Dark |
|---|---|---|
| `--ds-pink-100` | `#ffeaf5` | `#310d1e` |
| `--ds-pink-100-value` | `330, 100%, 96%` | `335, 32%, 12%` |
| `--ds-pink-200` | `#ffeaf2` | `#420c25` |
| `--ds-pink-200-value` | `340, 90%, 96%` | `335, 43%, 16%` |
| `--ds-pink-300` | `#ffe0eb` | `#571032` |
| `--ds-pink-300-value` | `340, 82%, 94%` | `335, 47%, 21%` |
| `--ds-pink-400` | `#ffd5e1` | `#5d0c34` |
| `--ds-pink-400-value` | `341, 76%, 91%` | `335, 51%, 22%` |
| `--ds-pink-500` | `#fdb3cc` | `#76063f` |
| `--ds-pink-500-value` | `340, 75%, 84%` | `335, 57%, 27%` |
| `--ds-pink-600` | `#f97ea7` | `#b90056` |
| `--ds-pink-600-value` | `341, 75%, 73%` | `336, 75%, 40%` |
| `--ds-pink-700` | `#f22782` | `#f12b82` |
| `--ds-pink-700-value` | `336, 80%, 58%` | `336, 80%, 58%` |
| `--ds-pink-800` | `#e4106e` | `#e6006e` |
| `--ds-pink-800-value` | `336, 74%, 51%` | `336, 74%, 51%` |
| `--ds-pink-900` | `#c41562` | `#ff518d` |
| `--ds-pink-900-value` | `336, 65%, 45%` | `341, 90%, 67%` |
| `--ds-pink-1000` | `#460523` | `#ffeaf4` |
| `--ds-pink-1000-value` | `333, 74%, 15%` | `333, 90%, 96%` |

## geist semantic (legacy)

| Токен | Light | Dark |
|---|---|---|
| `--geist-background` | `#fff` | `#000` |
| `--geist-background-rgb` | `255, 255, 255` | `0, 0, 0` |
| `--geist-cyan` | `#50e3c2` | — |
| `--geist-cyan-dark` | `#29bc9b` | — |
| `--geist-cyan-light` | `#79ffe1` | — |
| `--geist-cyan-lighter` | `#aaffec` | — |
| `--geist-error` | `#e00` | `red` |
| `--geist-error-dark` | `#c50000` | `#e60000` |
| `--geist-error-light` | `#ff1a1a` | `#f33` |
| `--geist-error-lighter` | `#f7d4d6` | — |
| `--geist-foreground` | `#000` | `#fff` |
| `--geist-foreground-rgb` | `0, 0, 0` | `255, 255, 255` |
| `--geist-highlight-magenta` | `#eb367f` | — |
| `--geist-highlight-pink` | `#ff0080` | — |
| `--geist-highlight-purple` | `#f81ce5` | — |
| `--geist-highlight-yellow` | `#fff500` | — |
| `--geist-link-color` | `var(--ds-blue-700)` | `var(--ds-blue-900)` |
| `--geist-marketing-gray` | `#fafbfc` | `var(--accents-1)` |
| `--geist-secondary` | `var(--accents-5)` | `var(--accents-5)` |
| `--geist-secondary-dark` | `var(--accents-7)` | `var(--accents-7)` |
| `--geist-secondary-light` | `var(--accents-3)` | `var(--accents-3)` |
| `--geist-secondary-lighter` | `var(--accents-2)` | `var(--accents-2)` |
| `--geist-selection` | `var(--ds-gray-1000)` | `var(--ds-gray-1000)` |
| `--geist-selection-text-color` | `var(--ds-gray-100)` | `var(--ds-gray-100)` |
| `--geist-success` | `#0070f3` | — |
| `--geist-success-dark` | `#0761d1` | — |
| `--geist-success-light` | `#3291ff` | — |
| `--geist-success-lighter` | `#d3e5ff` | — |
| `--geist-violet` | `#7928ca` | — |
| `--geist-violet-background` | `#fff` | `#291d3a` |
| `--geist-violet-background-secondary` | `#291c3a` | `#211830` |
| `--geist-violet-background-tertiary` | `#eae5f4` | `#211830` |
| `--geist-violet-dark` | `#4c2889` | — |
| `--geist-violet-light` | `#8a63d2` | — |
| `--geist-violet-lighter` | `#d8ccf1` | — |
| `--geist-warning` | `#f5a623` | — |
| `--geist-warning-dark` | `#ab570a` | — |
| `--geist-warning-light` | `#f7b955` | — |
| `--geist-warning-lighter` | `#ffefcf` | — |

## accents (legacy)

| Токен | Light | Dark |
|---|---|---|
| `--accents-1` | `#fafafa` | `#111` |
| `--accents-2` | `#eaeaea` | `#333` |
| `--accents-3` | `#999` | `#444` |
| `--accents-4` | `#888` | `#666` |
| `--accents-5` | `#666` | `#888` |
| `--accents-6` | `#444` | `#999` |
| `--accents-7` | `#333` | `#eaeaea` |
| `--accents-8` | `#111` | `#fafafa` |

## geist misc (legacy)

| Токен | Light | Dark |
|---|---|---|
| `--geist-code` | `var(--geist-foreground)` | `var(--geist-foreground)` |
| `--geist-console-header` | `#efe7ed` | `#0f0310` |
| `--geist-console-purple` | `#7928ca` | `#8a63d2` |
| `--geist-console-text-color-blue` | `#0070f3` | `#3291ff` |
| `--geist-console-text-color-default` | `var(--geist-foreground)` | `var(--geist-foreground)` |
| `--geist-console-text-color-pink` | `#eb367f` | `#eb367f` |
| `--geist-console-text-color-purple` | `#7928ca` | — |
| `--geist-form-font` | `.875rem` | — |
| `--geist-form-height` | `var(--geist-space-medium)` | — |
| `--geist-form-large-font` | `1rem` | — |
| `--geist-form-large-height` | `var(--geist-space-large)` | — |
| `--geist-form-large-line-height` | `1.5rem` | — |
| `--geist-form-line-height` | `1.25rem` | — |
| `--geist-form-small-font` | `.875rem` | — |
| `--geist-form-small-height` | `var(--geist-space-small)` | — |
| `--geist-form-small-line-height` | `.875rem` | — |
| `--geist-page-margin` | `var(--geist-space-gap)` | — |
| `--geist-page-width` | `1200px` | — |
| `--geist-page-width-with-margin` | `calc(var(--geist-page-width) + calc(2 * var(--geist-page-margin)))` | — |
| `--geist-text-gradient` | `linear-gradient(180deg, #000c 0%, #000 100%)` | `linear-gradient(180deg, #fff 0%, #ffffffbf 100%)` |

## other

| Токен | Light | Dark |
|---|---|---|
| `--color-gray-200` | `var(--ds-gray-200)` | — |
| `--color-gray-950` | `#030712` | — |
| `--color-indigo-600` | `#4f39f6` | — |
| `--container-4xl` | `56rem` | — |
| `--container-md` | `28rem` | — |
| `--container-sm` | `24rem` | — |
| `--container-xs` | `20rem` | — |
| `--develop-end-gradient` | `#00dfd8` | — |
| `--develop-line-end` | `#019ae9` | — |
| `--develop-start-gradient` | `#007cf0` | — |
| `--develop-text` | `#0a72ef` | — |
| `--dropdown-box-shadow` | `0 4px 4px 0 #00000005` | `0 0 0 1px var(--accents-2)` |
| `--dropdown-triangle-stroke` | `#fff` | `#333` |
| `--ease-in` | `cubic-bezier(.4, 0, 1, 1)` | — |
| `--ease-in-out` | `cubic-bezier(.4, 0, .2, 1)` | — |
| `--ease-out` | `cubic-bezier(0, 0, .2, 1)` | — |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | — |
| `--font-mono-fallback` | `"Roboto Mono", Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace` | — |
| `--font-sans` | `var(--font-geist-sans)` | — |
| `--font-sans-fallback` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif` | — |
| `--font-weight-medium` | `500` | — |
| `--font-weight-normal` | `400` | — |
| `--font-weight-semibold` | `600` | — |
| `--footer-height` | `79px` | — |
| `--header-border-bottom` | `0 1px 0 0 #0000001a` | `0 1px 0 0 #ffffff1a` |
| `--header-height` | `64px` | — |
| `--header-import-flow-background` | `#fafafacc` | `#111c` |
| `--header-sub-menu-height` | `46px` | — |
| `--header-zindex` | `75` | — |
| `--next-icon-border` | `#000` | `#fff` |
| `--preview-end-gradient` | `#ff0080` | — |
| `--preview-line-end` | `#9a1fb8` | — |
| `--preview-start-gradient` | `#7928ca` | — |
| `--preview-text` | `#de1d8d` | — |
| `--scroller-end` | `#fff0` | `#0000` |
| `--scroller-start` | `#fff` | `#000` |
| `--shadow-extra-small` | `0px 4px 8px #0000001f` | `0 0 0 1px var(--accents-2)` |
| `--shadow-hover` | `0 30px 60px #0000001f` | `0 0 0 1px var(--geist-foreground)` |
| `--shadow-large` | `0 30px 60px #0000001f` | `0 0 0 1px var(--accents-2)` |
| `--shadow-medium` | `0 8px 30px #0000001f` | `0 0 0 1px var(--accents-2)` |
| `--shadow-small` | `0 5px 10px #0000001f` | `0 0 0 1px var(--accents-2)` |
| `--shadow-smallest` | `0px 2px 4px #0000001a` | `0 0 0 1px var(--accents-2)` |
| `--shadow-sticky` | `0 12px 10px -10px #0000001f` | `0 0 0 1px var(--accents-2)` |
| `--ship-end-gradient` | `#f9cb28` | — |
| `--ship-line-end` | `#f9cb28` | — |
| `--ship-start-gradient` | `#ff4d4d` | — |
| `--ship-text` | `#ff5b4f` | — |
| `--spacing` | `.25rem` | — |
| `--wv-green` | `#0cce6b` | — |
| `--wv-orange` | `#ffa400` | — |
| `--wv-red` | `#ff4e42` | — |

