export type IconName = 'shield' | 'clipboard' | 'tool' | 'power' | 'clock' | 'pin' | 'arrow' | 'document' | 'grid' | 'check' | 'back' | 'radio'
const paths: Record<IconName, string> = {
  shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Z M8 12l3 3 5-6',
  clipboard:'M8 5H5v16h14V5h-3 M9 3h6v4H9V3Z M8 12l2 2 3-3 M8 17h7',
  tool:'M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z',
  power:'M12 2v10 M6 5a9 9 0 1 0 12 0',
  clock:'M9 2h6 M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M12 9v5l3 2 M18 3l3 3',
  pin:'M12 22s8-8 8-14a8 8 0 0 0-16 0c0 6 8 14 8 14Z M12 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  arrow:'m9 5 7 7-7 7', document:'M5 2h9l5 5v15H5V2Z M14 2v6h5 M8 12h8 M8 16h8',
  grid:'M3 3h7v7H3V3Z M14 3h7v7h-7V3Z M3 14h7v7H3v-7Z M14 14h7v7h-7v-7Z',
  check:'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z M7 12l3 3 7-7',
  back:'M20 12H4 m7-7-7 7 7 7', radio:'M8 8h10v14H8V8Z M11 8V2 M10 12h6 M10 15h6 M11 19h1 M15 19h1',
}
export default function OperatorIcon({name,className=''}:{name:IconName;className?:string}) {
 return <svg className={`operator-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>
}
