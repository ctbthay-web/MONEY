# Plano de testes Money
Execução: `E2E_BASE_URL=http://localhost:5173 TEST_USER_A_EMAIL=... TEST_USER_A_PASSWORD=... npx playwright test`
Projetos: chromium, firefox, webkit, mobile-android, mobile-ios, tablet. Relatório: `npx playwright show-report reports/html`.
Instalar: `npm i -D @playwright/test && npx playwright install`. Nunca apontar para produção (config bloqueia).
Módulos: ver tests/<módulo>/. Públicos já rodam sem credenciais; demais ficam pendentes.
