# Desempenho
Medido: bundle principal `index-PO0JHQhW.js` = 1.401.281 B (≈398 KB gzip), mais jsPDF 399 KB e html2canvas 199 KB (chunks separados). Landing local carrega em ≈0,3 s (sem rede real — indicativo).
Risco: um único chunk de 1,4 MB atrasa a primeira tela em redes móveis (M-07). Medições de Lighthouse/Web Vitals, paginação com milhares de lançamentos, gráficos com muitos dados e consultas lentas **não executadas** (exigem ambiente com dados).
Sugestão: `React.lazy` por rota, `manualChunks`, índices em `transactions(user_id, date)` (verificar no SQL), paginação.
