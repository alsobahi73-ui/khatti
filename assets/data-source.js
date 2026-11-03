/* مصدر بيانات الخطوط — قراءة سحابية أولاً والبيانات التجريبية احتياطاً */
(function(root){
  async function loadLines(){
    const cloud = (typeof window !== "undefined" && window.KhattiCloud) || root.KhattiCloud || (typeof KhattiCloud !== "undefined" ? KhattiCloud : null);
    const fallback = (typeof LINES !== "undefined" && Array.isArray(LINES)) ? LINES : (Array.isArray(root.LINES) ? root.LINES : []);
    if(cloud && typeof cloud.isConfigured === "function" && cloud.isConfigured() && typeof cloud.fetchLines === "function"){
      try {
        const remote = await cloud.fetchLines();
        if(Array.isArray(remote) && remote.length > 0){
          if(typeof LINES !== "undefined" && Array.isArray(LINES)){
            LINES.splice(0, LINES.length, ...remote);
          }
          return remote;
        }
      } catch(e){}
    }
    return fallback;
  }

  const DataSource = { loadLines };
  if(typeof window !== "undefined"){
    window.loadLines = loadLines;
    window.KhattiDataSource = DataSource;
  }
  root.loadLines = loadLines;
  root.KhattiDataSource = DataSource;
  if(typeof module !== "undefined" && module.exports){
    module.exports = { loadLines, DataSource };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
