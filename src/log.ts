interface Logger {
    info: (msg: string, ...props: unknown[]) => void;
    error: (msg: string, ...props: unknown[]) => void;
  }
  
  let c = 0;
  const colors = ["red", "blue", "green", "purple", "orange"];
  
  export function logger(name: string): Logger {
    const color = colors[c++ % colors.length];
  
    return {
      info,
      error,
    };
  
    function info(msg: string, ...props: any[]) {
        if (isLoggerEnabled(name)) {
            log(console.info, msg, props);
          }
    }
  
    function error(msg: string, ...props: any[]) {
        if (isLoggerEnabled(name)) {
            log(console.error, msg, props);
          }
    }
  
    function log(
      fn: (msg: string, props: any[]) => void,
      msg: string,
      props: any[],
    ) {
      const timestamp = getFormattedTimestamp();
  
      const args: any[] =
        typeof window === "undefined"
          ? [`<${name}>  ${timestamp}`, msg]
          : [
              `%c${timestamp} %c<${name}>%c ${msg}`,
              `color: gray;`,
              `color: ${color};font-weight: bold;`,
              "color: inherit",
            ];
  
      if (props.length > 1) {
        args.push(...props.slice(0, -1));
        args.push(props[props.length - 1]);
      } else if (props.length > 0) {
        args.push(props[0]);
      }
  
      // @ts-ignore
      fn.apply(console, args);
    }
  }

  function getFormattedTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }
  
  function isLoggerEnabled(name: string): boolean {
    if (typeof window !== 'undefined') {
      return true;
    }
    
    const logEnv = process.env.LOG;
    if (!logEnv) {
      return false; // Quiet by default on server-side
    }
    
    if (logEnv === '*') {
      return true;
    }
    
    const enabledLoggers = logEnv.split(',');
    return enabledLoggers.includes(name);
  }