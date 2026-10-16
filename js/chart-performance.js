// Performance tuning: dashboard charts render without animation so large Firebase
// datasets do not block the main thread during navigation or refresh.
if(typeof Chart!=='undefined'){ Chart.defaults.animation=false; Chart.defaults.transitions={active:{animation:{duration:0}},resize:{animation:{duration:0}},show:{animation:{duration:0}},hide:{animation:{duration:0}}}; }
