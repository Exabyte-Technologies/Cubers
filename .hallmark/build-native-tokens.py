from pathlib import Path
import re,math,json
css=Path('apps/mobile/src/design/tokens.css').read_text()
def hexcolor(spec):
 m=re.fullmatch(r'oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)',spec)
 L,C,h=map(float,m.groups());L/=100;h=math.radians(h);a=C*math.cos(h);b=C*math.sin(h)
 l=(L+.3963377774*a+.2158037573*b)**3;m=(L-.1055613458*a-.0638541728*b)**3;s=(L-.0894841775*a-1.291485548*b)**3
 rgb=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]
 def c(v):return round(max(0,min(1,12.92*v if v<=.0031308 else 1.055*max(v,0)**(1/2.4)-.055))*255)
 return '#'+''.join(f'{c(v):02x}' for v in rgb)
lookup={k:hexcolor(v) for k,v in re.findall(r'--(color-[\w-]+):\s*(oklch\([\d.% ]+\))',css)}
roles={'bg':'paper','paper':'card','ink':'ink','muted':'muted','line':'rule','green':'accent-2','mint':'mint','yellow':'accent','lavender':'sugar','orange':None,'red':'error','accent':'accent','onAccent':'accent-ink','onInk':'paper','edge':'edge','blue':'accent-2','coral':'accent-3','mintDeep':'mint-deep','softBlue':'sugar','softCoral':None,'buttonEdge':'accent-deep','field':'paper-2','shadow':'ink','errorSurface':None}
light={k:lookup['color-'+v] if v else hexcolor('oklch(94% 0.035 22)') for k,v in roles.items()}
dark={**light,**{k:hexcolor(v) for k,v in {'bg':'oklch(17% 0.012 255)','paper':'oklch(23% 0.014 255)','ink':'oklch(95% 0.012 95)','muted':'oklch(75% 0.014 95)','line':'oklch(36% 0.018 255)','green':'oklch(75% 0.12 250)','mint':'oklch(31% 0.05 152)','lavender':'oklch(30% 0.035 236)','orange':'oklch(32% 0.045 22)','red':'oklch(78% 0.14 27)','edge':'oklch(41% 0.025 255)','blue':'oklch(75% 0.12 250)','coral':'oklch(78% 0.14 22)','mintDeep':'oklch(80% 0.12 152)','softBlue':'oklch(30% 0.035 236)','softCoral':'oklch(32% 0.045 22)','field':'oklch(20% 0.014 255)','errorSurface':'oklch(32% 0.045 22)','onInk':'oklch(17% 0.012 255)'}.items()}}
text='// Hallmark Hum: native sRGB equivalents of the declared OKLCH theme.\n'
text+='export const lightPalette = '+json.dumps(light,indent=2)+';\nexport const darkPalette = '+json.dumps(dark,indent=2)+';\n'
text+='''export const fonts = { body: "ChillaxMedium", strong: "ChillaxSemibold", code: "monospace" } as const;
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 40, xxl: 64 } as const;
export const radii = { card: 24, stock: 16, field: 14, pill: 999 } as const;
export const brandPalette = { green: "#285c47", sun: "#f2b16c", top: "#f3d66c", left: "#71ad8b", right: "#8c83bf", grid: "#f7f5ef" } as const;
export const avatarPalette = { mint: ["#dfeee4", "#285c47", "#71ad8b"], sunset: ["#fff0d7", "#814000", "#d98627"], indigo: ["#e9e5f7", "#483e82", "#9183c5"], rose: ["#fbe4e7", "#8c324b", "#cf778e"] } as const;
export const puzzleRenderPalette = { clear: "#000000", light: "#fff9e8", plastic: "#26342d", cubeOutline: "#89978b", triangleOutline: "#57685d", netInk: "#17271d", cameraFrame: "#f8faf9", mutedInk: "#52655a" } as const;
'''
Path('apps/mobile/src/design/tokens.ts').write_text(text)
