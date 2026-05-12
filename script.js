if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW erro:', err));
}

// VARIÁVEIS GLOBAIS
let tentativasPin = 0;
let pinBloqueadoAte = 0;
let modoTeste = true;
let modoProducao = false;
let menuTimeout = null;

let dados = JSON.parse(localStorage.getItem('bankday') || '[]');
let contas = JSON.parse(localStorage.getItem('bankday_contas') || '[]');
let cartoes = JSON.parse(localStorage.getItem('bankday_cartoes') || '[]');
let config = JSON.parse(localStorage.getItem('bankday_config') || '{"projetarSaldo":false}');

let mesAtual = new Date();
let valoresOcultos = false;
let editandoId = null;
let tempContas = [];
let tempCartoes = [];
let chartInstance = null;
let tipoGraficoAtivo = 'categoria';

const formatar = v => {
    v = Number(v) || 0;
    return valoresOcultos? 'R$ ••••' : `R$ ${v.toFixed(2).replace('.',',')}`;
};
const cap = s => s? s.charAt(0).toUpperCase() + s.slice(1) : '';

const CATEGORIAS = {
    entrada: {
        'Salário': ['salario','pagamento','freela'],
        'Vendas': ['venda','vendi','mercado','olx'],
        'Outras Receitas': []
    },
    saida: {
        'Alimentação': ['ifood','mercado','restaurante','cafe','lanche','pizza'],
        'Transporte': ['uber','99','gasolina','posto'],
        'Moradia': ['aluguel','luz','agua','internet'],
        'Lazer': ['cinema','netflix','spotify','bar'],
        'Compras': ['shopee','amazon','roupa','tenis'],
        'Outras Despesas': []
    }
};

function salvar() {
    localStorage.setItem('bankday', JSON.stringify(dados));
    localStorage.setItem('bankday_contas', JSON.stringify(contas));
    localStorage.setItem('bankday_cartoes', JSON.stringify(cartoes));
    localStorage.setItem('bankday_config', JSON.stringify(config));
}

function identificarCategoria(desc, tipo = 'saida') {
    if (!desc) return tipo === 'entrada'? 'Outras Receitas' : 'Outras Despesas';
    const d = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const categorias = CATEGORIAS;
    for (const [categoria, palavras] of Object.entries(categorias)) {
        if (palavras.some(p => d.includes(p))) return categoria;
    }
    return tipo === 'entrada'? 'Outras Receitas' : 'Outras Despesas';
}

function initPin() {
    const telaPin = document.getElementById('tela-pin');
    const PIN_SALVO = localStorage.getItem('bankday_pin');
    const EH_PRIMEIRO =!PIN_SALVO;
    document.getElementById('pin-titulo').textContent = EH_PRIMEIRO? 'Crie seu PIN' : 'Digite seu PIN';
    document.getElementById('pin-subtitulo').textContent = EH_PRIMEIRO? '4 dígitos para proteger o app' : 'Para acessar o app';
    document.getElementById('btn-esqueci').style.display = EH_PRIMEIRO? 'none' : 'block';
    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, idx) => {
        input.value = '';
        input.disabled = false;
        input.classList.remove('border-rose-500');
        input.oninput = (e) => {
            if (e.target.value.length === 1 && idx < 3) inputs[idx + 1].focus();
            if (idx === 3 && e.target.value.length === 1) setTimeout(validarPin, 100);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Backspace' && e.target.value === '' && idx > 0) inputs[idx - 1].focus();
        };
    });
    const agora = Date.now();
    if (pinBloqueadoAte > agora) {
        const segundos = Math.ceil((pinBloqueadoAte - agora) / 1000);
        bloquearPin(segundos);
    } else {
        inputs[0].focus();
        pinBloqueadoAte = 0;
        tentativasPin = 0;
    }
    telaPin.style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

function validarPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    if (pin.length!== 4) return;
    const PIN_SALVO = localStorage.getItem('bankday_pin');
    const EH_PRIMEIRO =!PIN_SALVO;
    const erro = document.getElementById('pin-erro');
    if (EH_PRIMEIRO) {
        localStorage.setItem('bankday_pin', btoa(pin));
        liberarApp();
    } else {
        if (btoa(pin) === PIN_SALVO) {
            liberarApp();
        } else {
            tentativasPin++;
            erro.textContent = `PIN incorreto. ${3 - tentativasPin} tentativas restantes`;
            erro.classList.remove('hidden');
            inputs.forEach(i => {
                i.value = '';
                i.classList.add('border-rose-500');
            });
            inputs[0].focus();
            setTimeout(() => inputs.forEach(i => i.classList.remove('border-rose-500')), 1000);
            if (tentativasPin >= 3) {
                pinBloqueadoAte = Date.now() + 30000;
                bloquearPin(30);
            }
        }
    }
}

function bloquearPin(s) {
    const inputs = document.querySelectorAll('.pin-input');
    const erro = document.getElementById('pin-erro');
    inputs.forEach(i => { i.disabled = true; i.value = ''; });
    let contador = s;
    erro.classList.remove('hidden');
    erro.textContent = `Muitas tentativas. Tente em ${contador}s`;
    const interval = setInterval(() => {
        contador--;
        if (contador <= 0) {
            clearInterval(interval);
            inputs.forEach(i => i.disabled = false);
            erro.classList.add('hidden');
            inputs[0].focus();
            tentativasPin = 0;
            pinBloqueadoAte = 0;
        } else {
            erro.textContent = `Muitas tentativas. Tente em ${contador}s`;
        }
    }, 1000);
}

function liberarApp() {
    tentativasPin = 0;
    pinBloqueadoAte = 0;
    document.getElementById('pin-erro').classList.add('hidden');
    document.getElementById('tela-pin').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach(i => { i.disabled = false; i.value = ''; });
}

function esqueciPin() {
    if (confirm('Esqueceu o PIN?\n\nIsso vai apagar TODOS os dados.')) {
        localStorage.clear();
        location.reload();
    }
}

function selecionarModo(tipo) {
    localStorage.setItem('bankday_modo', tipo);
    document.getElementById('modal-onboarding').style.display = 'none';
    if (tipo === 'producao') {
        modoProducao = true;
        modoTeste = false;
    } else {
        modoTeste = true;
        modoProducao = false;
        if (!contas.length) contas = [{nome: 'Principal', saldoInicial: 0}];
        salvar();
        document.getElementById('app-content').style.display = 'flex';
        document.getElementById('tela-pin').style.display = 'none';
    }
}

function addMensagem(texto, tipo = 'system', info = '', autoLimpar = true, id = null) {
    const chat = document.getElementById("chat-box");
    if (!chat) return;
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement("div");
    div.className = `msg ${tipo}`;
    if (id) div.onclick = () => abrirModalEditar(id);
    div.innerHTML = `
        <div class="msg-bubble">
            <p>${texto}</p>
        ${info? `<span class="msg-badge"><i class="fas fa-tag"></i>${info}</span>` : ''}
            <div class="msg-time">${hora}</div>
        </div>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    if (autoLimpar && tipo === 'system') {
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 8000);
    }
}

function processarMensagem() {
    const input = document.getElementById("user-input");
    if (!input) return;
    let textoOriginal = input.value.trim();
    if (!textoOriginal) return;
    const texto = textoOriginal.toLowerCase();
    input.value = "";
    if (!contas.length) {
        contas = [{nome: 'Principal', saldoInicial: 0}];
        salvar();
    }
    const tipo = texto.includes('recebi') || texto.includes('vendi') || texto.includes('ganhei')? 'entrada' : 'saida';
    let metodo = "conta";
    if (texto.includes('cartao') || texto.includes('crédito') || texto.includes('credito') || texto.includes('nubank') || texto.includes('visa') || texto.includes('master') || texto.includes('fatura')) {
        metodo = 'cartao';
    }
    let banco = metodo === 'cartao'? (cartoes[0]?.nome || 'Cartão') : (contas[0]?.nome || 'Principal');
    const regexParcelado = /(?:comprei\s+)?(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:reais?)?\s*(?:em\s+)?(\d{1,2})x?(?:\s+vezes)?(?:\s+(?:no\s+)?(.+))?/;
    const matchParc = texto.match(regexParcelado);
    if (matchParc && (texto.includes('x') || texto.includes('vezes'))) {
        const [, desc, valorStr, parcelasStr, cartaoNome] = matchParc;
        const valor = parseFloat(valorStr.replace(',', '.'));
        const parcelas = parseInt(parcelasStr);
        if (parcelas > 1 && valor) {
            const nomeCartao = cartaoNome? cap(cartaoNome) : (cartoes[0]?.nome || 'Cartão');
            if (!cartoes.length) {
                addMensagem("Cadastre um cartão primeiro", 'system');
                return;
            }
            parceleiNoCartao(cap(desc.trim()), valor, parcelas, nomeCartao);
            return;
        }
    }
    const valorNum = parseFloat(texto.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.'));
    if (isNaN(valorNum)) {
        addMensagem("Ex: 'cafe 15' ou 'recebi 500 salario'", 'system');
        return;
    }
    const desc = texto.replace(/recebi|gastei|comprei|paguei|vendi|ganhei|no|na|em|conta|\d+(?:[.,]\d+)?|reais?|credito|x|vezes|a\s*vista|avista/gi, '').trim() || 'Lançamento';
    const id = Date.now();
    dados.push({
        id: id,
        descricao: cap(desc),
        valor: valorNum,
        tipo: tipo,
        metodo: metodo,
        banco: banco,
        data: new Date().toISOString(),
        texto: textoOriginal,
        categoria: identificarCategoria(desc, tipo)
    });
    addMensagem(textoOriginal, 'user', `Categoria: ${identificarCategoria(desc, tipo)}`, false, id);
    salvar();
    atualizar();
}

function executarImportacao() {
    const texto = document.getElementById('texto-importacao').value.trim();
    if (!texto) {
        addMensagem('Cole o extrato primeiro', 'system');
        return;
    }
    const linhas = texto.split('\n');
    let importadas = 0;
    let erros = 0;
    linhas.forEach((linha, idx) => {
        linha = linha.trim();
        if (!linha || linha.toUpperCase().includes('DATA') || linha.toUpperCase().includes('LANÇAMENTO') || linha.toUpperCase().includes('SALDO')) return;
        let data, desc, valor, tipo;
        let match = null;
        match = linha.match(/^(\d{2}-\d{4})\s+(.+?)\s+([\d.,]+)\s+\d{10,}$/);
        if (match) {
            [, data, desc, valor] = match;
            data = data.replace(/-/g, '/');
            tipo = desc.toLowerCase().match(/rendimento|receb|depós|créd|estorno|pix receb/)? 'C' : 'D';
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*([CD])?$/i);
            if (match) [, data, desc, valor, tipo] = match;
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s*([+-])\s*R?\$?\s*([\d.,]+)$/i);
            if (match) [, data, desc, tipo, valor] = match;
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2})\s+(.+?)\s+([\d.,]+)([+-])$/i);
            if (match) {
                [, data, desc, valor, tipo] = match;
                data += '/' + new Date().getFullYear();
            }
        }
        if (!match) {
            match = linha.match(/^(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+([\d.,]+)$/i);
            if (match) {
                [, data, desc, valor] = match;
                tipo = desc.toLowerCase().match(/receb|depós|créd|estorno|salár|rendimento/)? 'C' : 'D';
            }
        }
        if (match && valor) {
            try {
                let partesData = data.split('/');
                let dia = partesData[0];
                let mes = partesData[1];
                let ano = partesData[2];
                if (ano.length === 2) ano = '20' + ano;
                const dataISO = new Date(ano, mes - 1, dia).toISOString();
                const valorNum = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
                if (isNaN(valorNum) || valorNum === 0) return;
                const tipoFinal = (tipo?.toUpperCase() === 'C' || tipo === '+')? 'entrada' : 'saida';
                desc = desc.trim().replace(/\s+\d{10,}$/, '').replace(/\s+/g, ' ');
                const id = Date.now() + Math.random() + idx;
                dados.push({
                    id: id,
                    descricao: cap(desc),
                    valor: valorNum,
                    tipo: tipoFinal,
                    metodo: 'conta',
                    banco: contas[0]?.nome || 'Principal',
                    data: dataISO,
                    texto: linha,
                    categoria: identificarCategoria(desc, tipoFinal)
                });
                importadas++;
            } catch (e) {
                erros++;
            }
        }
    });
    if (importadas > 0) {
        salvar();
        atualizar();
        fecharModal('modal-importar');
        addMensagem(`${importadas} transações importadas`, 'system');
        if (erros > 0) addMensagem(`${erros} linhas ignoradas`, 'system');
    } else {
        addMensagem('Nenhuma transação com valor encontrada', 'system');
    }
}

function lerArquivoExtrato(event) {
    const file = event.target.files[0];
    if (!file) {
        addMensagem('Nenhum arquivo selecionado', 'system');
        return;
    }
    console.log('Arquivo selecionado:', file.name);
    addMensagem(`Lendo arquivo ${file.name}...`, 'system');
    const reader = new FileReader();
    reader.onload = function(e) {
        const conteudo = e.target.result;
        const extensao = file.name.split('.').pop().toLowerCase();
        console.log('Conteúdo lido:', conteudo.substring(0, 200));
        if (extensao === 'csv') {
            importarCSV(conteudo);
        } else if (extensao === 'ofx') {
            importarOFX(conteudo);
        } else {
            addMensagem('Formato inválido. Use.csv ou.ofx', 'system');
        }
    };
    reader.onerror = function() {
        addMensagem('Erro ao ler arquivo', 'system');
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
}

function importarCSV(texto) {
    console.log('CSV recebido:', texto.substring(0, 300));
    addMensagem('Processando CSV...', 'system');
    const linhas = texto.split('\n');
    let importadas = 0;
    let erros = 0;
    if (linhas.length < 2) {
        addMensagem('CSV vazio ou sem dados', 'system');
        return;
    }
    const primeiraLinha = linhas[0];
    const separador = primeiraLinha.includes(';')? ';' : ',';
    linhas.forEach((linha, idx) => {
        if (idx === 0 ||!linha.trim()) return;
        const cols = linha.split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) { erros++; return; }
        try {
            let data = cols[0];
            let desc = cols[1];
            let valor = cols[2];
            let tipo = cols[3] || null;
            data = data.replace(/-/g, '/');
            let partesData = data.split('/');
            if (partesData.length!== 3) { erros++; return; }
            if (partesData[2].length === 2) partesData[2] = '20' + partesData[2];
            const dataISO = new Date(partesData[2], partesData[1] - 1, partesData[0]).toISOString();
            if (isNaN(new Date(dataISO).getTime())) { erros++; return; }
            valor = parseFloat(valor.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
            if (isNaN(valor)) { erros++; return; }
            let tipoFinal = 'saida';
            if (tipo) {
                tipoFinal = tipo.toUpperCase().match(/C|CRÉD|CRED|\+|RECEB/)? 'entrada' : 'saida';
            } else {
                tipoFinal = valor > 0? 'entrada' : 'saida';
                valor = Math.abs(valor);
            }
            const id = Date.now() + Math.random() + idx;
            dados.push({
                id: id,
                descricao: cap(desc),
                valor: valor,
                tipo: tipoFinal,
                metodo: 'conta',
                banco: contas[0]?.nome || 'Principal',
                data: dataISO,
                texto: linha,
                categoria: identificarCategoria(desc, tipoFinal)
            });
            importadas++;
        } catch (e) {
            console.error('Erro linha:', idx, e);
            erros++;
        }
    });
    if (importadas > 0) {
        salvar();
        atualizar();
        fecharModal('modal-importar');
        addMensagem(`${importadas} transações importadas do CSV`, 'system');
        if (erros > 0) addMensagem(`${erros} linhas com erro`, 'system');
    } else {
        addMensagem('Nenhuma transação válida no CSV', 'system');
    }
}

function importarOFX(texto) {
    const transacoes = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g);
    if (!transacoes) {
        addMensagem('Arquivo OFX inválido', 'system');
        return;
    }
    let importadas = 0;
    transacoes.forEach((trans, idx) => {
        try {
            const data = trans.match(/<DTPOSTED>(\d{8})/)[1];
            const valor = parseFloat(trans.match(/<TRNAMT>(-?[\d.]+)/)[1]);
            const desc = trans.match(/<MEMO>([^<]+)/)[1];
            const ano = data.substr(0, 4);
            const mes = data.substr(4, 2);
            const dia = data.substr(6, 2);
            const dataISO = new Date(ano, mes - 1, dia).toISOString();
            const id = Date.now() + Math.random() + idx;
            dados.push({
                id: id,
                descricao: cap(desc),
                valor: Math.abs(valor),
                tipo: valor > 0? 'entrada' : 'saida',
                metodo: 'conta',
                banco: contas[0]?.nome || 'Principal',
                data: dataISO,
                texto: desc,
                categoria: identificarCategoria(desc, valor > 0? 'entrada' : 'saida')
            });
            importadas++;
        } catch (e) {}
    });
    if (importadas > 0) {
        salvar();
        atualizar();
        fecharModal('modal-importar');
        addMensagem(`${importadas} transações importadas do OFX`, 'system');
    }
}

function atualizar() {
    const mes = mesAtual.getMonth();
    const ano = mesAtual.getFullYear();
    let dadosMes = dados.filter(d => {
        const dt = new Date(d.data);
        return dt.getMonth() === mes && dt.getFullYear() === ano;
    });
    let ent = dadosMes.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
    let sai = dadosMes.filter(d => d.tipo === 'saida' && d.metodo!== 'cartao').reduce((s, d) => s + d.valor, 0);
    let fat = dadosMes.filter(d => d.tipo === 'saida' && d.metodo === 'cartao').reduce((s, d) => s + d.valor, 0);
    let saldo = ent - sai;
    let liquido = saldo - fat;
    if (config.projetarSaldo) {
        const hoje = new Date();
        const futuras = dados.filter(d => {
            const dt = new Date(d.data);
            return dt > hoje && dt.getMonth() === mes && dt.getFullYear() === ano;
        });
        const futurasEntradas = futuras.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
        const futurasSaidas = futuras.filter(d => d.tipo === 'saida').reduce((s, d) => s + d.valor, 0);
        saldo += futurasEntradas - futurasSaidas;
        liquido += futurasEntradas - futurasSaidas;
    }
    const elEntradas = document.getElementById('card-entradas');
    const elSaidas = document.getElementById('card-saidas');
    const elSaldo = document.getElementById('card-saldo');
    const elCartoes = document.getElementById('card-cartoes');
    const elLiquido = document.getElementById('card-liquido');
    if (elEntradas) elEntradas.textContent = formatar(ent);
    if (elSaidas) elSaidas.textContent = formatar(sai);
    if (elSaldo) elSaldo.textContent = formatar(saldo);
    if (elCartoes) elCartoes.textContent = formatar(fat);
    if (elLiquido) elLiquido.textContent = formatar(liquido);
    if (elSaldo) elSaldo.className = `val ${saldo >= 0? 'text-blue' : 'text-rose'}`;
    if (elLiquido) elLiquido.className = `val big ${liquido >= 0? 'text-emerald' : 'text-rose'}`;
    if (elSaidas) elSaidas.className = `val ${sai > ent? 'text-rose' : 'text-orange'}`;
    if (elCartoes) elCartoes.className = `val ${fat > saldo? 'text-rose' : 'text-orange'}`;
    aplicarVisualSaldoProjetado();
}

function ligarEventosInput() {
    const input = document.getElementById('user-input');
    const btn = document.getElementById('btn-enviar');
    if (input &&!input.dataset.ligado) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                processarMensagem();
            }
        });
        input.dataset.ligado = 'true';
    }
    if (btn &&!btn.dataset.ligado) {
        btn.addEventListener('click', processarMensagem);
        btn.dataset.ligado = 'true';
    }
}

function atualizarMes() {
    const el = document.getElementById('mesAtual');
    if (el) el.textContent = cap(mesAtual.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}).replace(' de ',' '));
}

function mudarMes(d) {
    mesAtual.setMonth(mesAtual.getMonth() + d);
    atualizar();
    atualizarMes();
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = document.body.classList.contains('light-mode')? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('bankday_tema', document.body.classList.contains('light-mode')? 'light' : 'dark');
}

function toggleVisibility() {
    valoresOcultos =!valoresOcultos;
    document.getElementById('eye-icon').className = valoresOcultos? 'fas fa-eye-slash' : 'fas fa-eye';
    atualizar();
}

function toggleMenu() {
    const menu = document.getElementById('menuDropdown');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    if (menuTimeout) clearTimeout(menuTimeout);
    if (isHidden) {
        menu.classList.remove('hidden');
        menuTimeout = setTimeout(() => menu.classList.add('hidden'), 10000);
    } else {
        menu.classList.add('hidden');
    }
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('menuDropdown');
    const btn = document.getElementById('btnMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (!menu.contains(e.target) &&!btn?.contains(e.target)) {
        menu.classList.add('hidden');
        if (menuTimeout) clearTimeout(menuTimeout);
    }
});

function trocarAba(aba, ev = null) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    if (ev && ev.target) {
        const navItem = ev.target.closest('.nav-item');
        if (navItem) navItem.classList.add('active');
    }
    if (aba === 'extrato') abrirModal('modal-extrato');
    if (aba === 'graficos') abrirModal('modal-graficos');
    if (aba === 'chat') {
        fecharModal('modal-extrato');
        fecharModal('modal-graficos');
    }
}

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
    if (id === 'modal-extrato') filtrarExtrato();
    if (id === 'modal-graficos') abrirGraficos();
    if (id === 'modal-contas') {
        tempContas = [...contas];
        tempCartoes = [...cartoes];
        renderizarListaTemp();
    }
}

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function filtrarExtrato() {
    const tipo = document.getElementById('filtro-tipo')?.value || '';
    const cat = document.getElementById('filtro-categoria')?.value || '';
    let filtrados = [...dados];
    if (tipo) {
        if (tipo === 'cartao') {
            filtrados = filtrados.filter(d => d.metodo === 'cartao');
        } else {
            filtrados = filtrados.filter(d => d.tipo === tipo);
        }
    }
    if (cat) filtrados = filtrados.filter(d => d.categoria === cat);
    const ent = filtrados.filter(d => d.tipo === 'entrada').reduce((s,d) => s+d.valor, 0);
    const sai = filtrados.filter(d => d.tipo === 'saida').reduce((s,d) => s+d.valor, 0);
    const elTotal = document.getElementById('total-extrato');
    if (elTotal) elTotal.textContent = `Entradas: ${formatar(ent)} | Saídas: ${formatar(sai)} | Saldo: ${formatar(ent - sai)}`;
    const lista = document.getElementById('lista-extrato');
    if (!lista) return;
    lista.innerHTML = filtrados.sort((a,b) => new Date(b.data) - new Date(a.data)).map(t => `
        <div class="item-temp" onclick="abrirModalEditar(${t.id})" style="cursor:pointer">
            <div>
                <div style="font-weight:600">${t.descricao}</div>
                <div style="font-size:11px;color:#64748b">${t.categoria} • ${new Date(t.data).toLocaleDateString('pt-BR')} • ${t.banco}</div>
            </div>
            <div style="font-weight:900;color:${t.tipo === 'entrada'? '#10b981' : '#f43f5e'}">
                ${t.tipo === 'entrada'? '+' : '-'} ${formatar(t.valor)}
            </div>
        </div>
    `).join('') || '<p style="text-align:center;color:#64748b">Nenhuma transação encontrada</p>';
    const catSelect = document.getElementById('filtro-categoria');
    if (catSelect) {
        const cats = new Set();
        dados.forEach(d => cats.add(d.categoria));
        catSelect.innerHTML = '<option value="">Todas categorias</option>' + Array.from(cats).sort().map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

function abrirGraficos() {
    document.getElementById('modal-graficos').style.display = 'flex';
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mes = mesAtual.getMonth();
    const ano = mesAtual.getFullYear();
    const elMes = document.getElementById('grafico-mes');
    if (elMes) elMes.textContent = `${meses[mes]} ${ano}`;
    trocarGrafico('categoria');
}

function trocarGrafico(tipo) {
    tipoGraficoAtivo = tipo;
    const btnCat = document.getElementById('btn-cat');
    const btnTipo = document.getElementById('btn-tipo');
    if (btnCat) btnCat.className = tipo === 'categoria'? 'flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold' : 'flex-1 bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-bold';
    if (btnTipo) btnTipo.className = tipo === 'tipo'? 'flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold' : 'flex-1 bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-bold';
    desenharGrafico();
}

function desenharGrafico() {
    const canvas = document.getElementById('grafico-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destrói gráfico anterior se existir
    if (window.graficoAtual) {
        window.graficoAtual.destroy();
    }

    const transacoes = filtrarPorMes(dados.transacoes);
    const tipoGrafico = estado.graficoTipo || 'categoria';

    let labels = [];
    let valores = [];
    let cores = [];

    if (tipoGrafico === 'categoria') {
        // Agrupa por categoria - só saídas
        const saidas = transacoes.filter(t => t.tipo === 'saida');
        const porCategoria = {};

        saidas.forEach(t => {
            const cat = t.categoria || 'Outros';
            porCategoria[cat] = (porCategoria[cat] || 0) + t.valor;
        });

        labels = Object.keys(porCategoria);
        valores = Object.values(porCategoria);
        cores = [
            '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
            '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
            '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'
        ];

        document.getElementById('btn-cat').classList.add('tab-active');
        document.getElementById('btn-tipo').classList.remove('tab-active');

    } else if (tipoGrafico === 'tipo') {
        // Entrada vs Saída
        const entradas = transacoes.filter(t => t.tipo === 'entrada')
           .reduce((s, t) => s + t.valor, 0);
        const saidas = transacoes.filter(t => t.tipo === 'saida')
           .reduce((s, t) => s + t.valor, 0);

        labels = ['Entradas', 'Saídas'];
        valores = [entradas, saidas];
        cores = ['#10b981', '#f97316'];

        document.getElementById('btn-tipo').classList.add('tab-active');
        document.getElementById('btn-cat').classList.remove('tab-active');
    }

    // Se não tem dados
    if (valores.length === 0 || valores.every(v => v === 0)) {
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText('Sem dados para exibir', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Cria o gráfico
    window.graficoAtual = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: cores.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((value / total) * 100).toFixed(1);
                            return `${label}: ${formatar(value)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Monta legenda manual
    montarLegenda(labels, valores, cores);
}

function montarLegenda(labels, valores, cores) {
    const legenda = document.getElementById('grafico-legenda');
    const total = valores.reduce((a, b) => a + b, 0);

    legenda.innerHTML = labels.map((label, i) => {
        const pct = ((valores[i] / total) * 100).toFixed(1);
        return `
            <div class="legenda-item">
                <span class="legenda-cor" style="background:${cores[i]}"></span>
                <span class="legenda-texto">${label}</span>
                <span class="legenda-valor">${formatar(valores[i])} <small>${pct}%</small></span>
            </div>
        `;
    }).join('');
}

function trocarGrafico(tipo) {
    tipoGraficoAtivo = tipo;
    const btnCat = document.getElementById('btn-cat');
    const btnTipo = document.getElementById('btn-tipo');
    if (btnCat) btnCat.className = tipo === 'categoria'
  ? 'flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold'
    : 'flex-1 bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-bold';
    if (btnTipo) btnTipo.className = tipo === 'tipo'
  ? 'flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold'
    : 'flex-1 bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-bold';
    desenharGrafico();
}

function desenharGrafico() {
    const mes = mesAtual.getMonth();
    const ano = mesAtual.getFullYear();

    const transacoesMes = dados.filter(t => {
        const dt = new Date(t.data);
        return dt.getMonth() === mes && dt.getFullYear() === ano;
    });

    if (chartInstance) {
        chartInstance.destroy();
    }

    const canvas = document.getElementById('grafico-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // =========================
    // GRÁFICO POR CATEGORIA
    // =========================

    if (tipoGraficoAtivo === 'categoria') {

        const gastosPorCat = {};

        transacoesMes
            .filter(t => t.tipo !== 'entrada')
            .forEach(t => {
                gastosPorCat[t.categoria] =
                    (gastosPorCat[t.categoria] || 0) + t.valor;
            });

        const dadosGraf = Object.entries(gastosPorCat)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        const elLegenda = document.getElementById('grafico-legenda');

        if (dadosGraf.length === 0) {
            if (elLegenda) {
                elLegenda.innerHTML = `
                    <p class="text-center text-slate-500 py-8">
                        Sem gastos no mês
                    </p>
                `;
            }
            return;
        }

        const labels = dadosGraf.map(d => d[0]);
        const valores = dadosGraf.map(d => d[1]);
        const total = valores.reduce((s, v) => s + v, 0);

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: valores,
                    backgroundColor: '#3b82f6',
                    borderRadius: 8,
                    barThickness: 18
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => {
                                const pct = ((ctx.raw / total) * 100).toFixed(1);

                                return [
                                    `Valor: R$ ${ctx.raw.toFixed(2).replace('.', ',')}`,
                                    `Participação: ${pct}%`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });

        if (elLegenda) {
            elLegenda.innerHTML = dadosGraf.map(([cat, val]) => {
                const pct = ((val / total) * 100).toFixed(1);

                return `
                    <div class="flex justify-between text-xs py-1">
                        <span>${cat}</span>
                        <span class="font-bold">
                            R$ ${val.toFixed(2).replace('.', ',')} - ${pct}%
                        </span>
                    </div>
                `;
            }).join('');
        }

    }

    // =========================
    // GRÁFICO POR TIPO
    // =========================

    else {

        let entrada = 0;
        let saida = 0;
        let cartao = 0;

        transacoesMes.forEach(t => {
            if (t.tipo === 'entrada') {
                entrada += t.valor;
            }
            else if (t.metodo === 'cartao') {
                cartao += t.valor;
            }
            else {
                saida += t.valor;
            }
        });

        const valores = [entrada, saida, cartao];
        const total = valores.reduce((s, v) => s + v, 0);

        const elLegenda = document.getElementById('grafico-legenda');

        if (total === 0) {
            if (elLegenda) {
                elLegenda.innerHTML = `
                    <p class="text-center text-slate-500 py-8">
                        Sem dados no mês
                    </p>
                `;
            }
            return;
        }

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Entradas', 'Saídas', 'Cartões'],
                datasets: [{
                    data: valores,
                    backgroundColor: [
                        '#10b981',
                        '#f97316',
                        '#ef4444'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        const dadosLegenda = [
            { label: 'Entradas', valor: entrada, cor: '#10b981' },
            { label: 'Saídas', valor: saida, cor: '#f97316' },
            { label: 'Cartões', valor: cartao, cor: '#ef4444' }
        ].filter(d => d.valor > 0);

        if (elLegenda) {
            elLegenda.innerHTML = dadosLegenda.map(d => {

                const pct = ((d.valor / total) * 100).toFixed(1);

                return `
                    <div class="flex justify-between items-center text-xs py-1">
                        <div class="flex items-center gap-2">
                            <div
                                class="w-3 h-3 rounded"
                                style="background:${d.cor}"
                            ></div>
                            <span>${d.label}</span>
                        </div>

                        <span class="font-bold">
                            R$ ${d.valor.toFixed(2).replace('.', ',')} - ${pct}%
                        </span>
                    </div>
                `;

            }).join('');
        }
    }
}



function renderizarListaTemp() {
    const listaContas = document.getElementById('lista-contas-temp');
    const listaCartoes = document.getElementById('lista-cartoes-temp');
    if (!listaContas ||!listaCartoes) return;
    listaContas.innerHTML = tempContas.map((c, i) => `
        <div class="item-temp">
            <span>${c.nome} - ${formatar(c.saldoInicial || 0)}</span>
            <button onclick="removerTempConta(${i})"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
    listaCartoes.innerHTML = tempCartoes.map((c, i) => `
        <div class="item-temp">
            <span>${c.nome} - Fecha ${c.diaFechamento} | Vence ${c.diaVencimento}</span>
            <button onclick="removerTempCartao(${i})"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

function addTempConta() {
    const nome = document.getElementById('conta-nome').value.trim();
    const saldo = parseFloat(document.getElementById('conta-saldo').value) || 0;
    if (!nome) return alert("Digite o nome da conta");
    tempContas.push({nome, saldoInicial: saldo});
    document.getElementById('conta-nome').value = '';
    document.getElementById('conta-saldo').value = '';
    renderizarListaTemp();
}

function addTempCartao() {
    const nome = document.getElementById('cartao-nome').value.trim();
    const diaFech = parseInt(document.getElementById('cartao-fechamento').value) || 2;
    const diaVenc = parseInt(document.getElementById('cartao-vencimento').value) || 7;
    if (!nome) return alert("Digite o nome do cartão");
    tempCartoes.push({nome, diaFechamento: diaFech, diaVencimento: diaVenc});
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-fechamento').value = '';
    document.getElementById('cartao-vencimento').value = '';
    renderizarListaTemp();
}

function removerTempConta(i) { tempContas.splice(i, 1); renderizarListaTemp(); }
function removerTempCartao(i) { tempCartoes.splice(i, 1); renderizarListaTemp(); }

function finalizarCadastro() {
    if (!tempContas.length) return alert("Cadastre pelo menos 1 conta");
    contas = [...tempContas];
    cartoes = [...tempCartoes];
    contas.forEach(c => {
        if (c.saldoInicial &&!dados.some(d => d.isSaldoInicial && d.banco === c.nome)) {
            dados.push({
                id: Date.now() + Math.random(),
                descricao: "Saldo inicial",
                valor: c.saldoInicial,
                tipo: "entrada",
                metodo: "conta",
                banco: c.nome,
                data: new Date().toISOString(),
                isSaldoInicial: true,
                categoria: 'Outras Receitas'
            });
        }
    });
    salvar();
    fecharModal('modal-contas');
    atualizar();
    addMensagem(`Configuração salva: ${contas.length} contas e ${cartoes.length} cartões`, 'system');
}

function abrirModalEditar(id) {
    editandoId = id;
    const t = dados.find(d => d.id === id);
    if (!t) return;
    document.getElementById('edit-desc').value = t.descricao;
    document.getElementById('edit-valor').value = t.valor;
    document.getElementById('edit-tipo').value = t.tipo;
    document.getElementById('edit-metodo').value = t.metodo;
    document.getElementById('edit-data').value = new Date(t.data).toISOString().split('T')[0];

    atualizarContasModal();
    atualizarCategorias();

    document.getElementById('edit-banco').value = t.banco;
    document.getElementById('edit-categoria').value = t.categoria;
    abrirModal('modal-editar');
}

function atualizarContasModal() {
    const metodo = document.getElementById('edit-metodo').value;
    const selectBanco = document.getElementById('edit-banco');
    selectBanco.innerHTML = '';
    const lista = metodo === 'cartao'? cartoes : contas;
    lista.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.nome;
        opt.textContent = item.nome;
        selectBanco.appendChild(opt);
    });
}

function atualizarCategorias() {
    const tipo = document.getElementById('edit-tipo').value;
    const selectCat = document.getElementById('edit-categoria');
    selectCat.innerHTML = '';
  const catsDoTipo = CATEGORIAS[tipo] || CATEGORIAS['saida'];
    Object.keys(catsDoTipo).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        selectCat.appendChild(opt);
    });
}


function salvarEdicao() {
    const t = dados.find(d => d.id === editandoId);
    if (!t) return;
    t.descricao = document.getElementById('edit-desc').value;
    t.valor = parseFloat(document.getElementById('edit-valor').value) || t.valor;
    t.tipo = document.getElementById('edit-tipo').value;
    t.metodo = document.getElementById('edit-metodo').value;
    t.banco = document.getElementById('edit-banco').value;
    t.categoria = document.getElementById('edit-categoria').value;
    t.data = new Date(document.getElementById('edit-data').value).toISOString();
    salvar();
    atualizar();
    fecharModal('modal-editar');
    addMensagem('Transação editada', 'system', `${t.descricao} - R$ ${t.valor.toFixed(2)}`);
}

function deletarTransacao() {
    dados = dados.filter(d => d.id!== editandoId);
    salvar();
    atualizar();
    fecharModal('modal-editar');
    addMensagem('Transação excluída', 'system');
}

function resetarTransacoes() {
    if (!confirm('Apagar todas as transações? Contas e cartões serão mantidos.')) return;
    dados = [];
    salvar();
    atualizar();
    addMensagem('Transações limpas', 'system');
    toggleMenu();
}

function resetarApp() {
    if (!confirm('Apagar TUDO? Não tem volta.')) return;
    localStorage.clear();
    location.reload();
}

function toggleProjetado() {
    config.projetarSaldo =!config.projetarSaldo;
    salvar();
    aplicarVisualSaldoProjetado();
    atualizar();
    toggleMenu();
    addMensagem(`Projeção ${config.projetarSaldo? 'ativada' : 'desativada'}`, 'system');
}

function aplicarVisualSaldoProjetado() {
    const btn = document.getElementById('btnProjetado');
    if (!btn) return;
    if (config.projetarSaldo) {
        btn.classList.remove('text-slate-400');
        btn.classList.add('text-blue-500');
    } else {
        btn.classList.add('text-slate-400');
        btn.classList.remove('text-blue-500');
    }
}

function editarContaCartao(tipo, idx) {
    alert('Edição em breve');
}

function abrirExtrato(tipo) {
    if (tipo === 'entrada') document.getElementById('filtro-tipo').value = 'entrada';
    if (tipo === 'saida') document.getElementById('filtro-tipo').value = 'saida';
    if (tipo === 'cartao') document.getElementById('filtro-tipo').value = 'cartao';
    if (tipo === 'saldo') document.getElementById('filtro-tipo').value = '';
    abrirModal('modal-extrato');
    filtrarExtrato();
}

// LIGA TUDO QUANDO O DOM CARREGAR
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado');
    
    let modo = localStorage.getItem('bankday_modo');

if (!modo) {
    modo = 'teste';
    localStorage.setItem('bankday_modo', 'teste');
        }
    if (!modo) {
        document.getElementById('modal-onboarding').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('tela-pin').style.display = 'none';
    } else if (modo === 'teste') {
        document.getElementById('modal-onboarding').style.display = 'none';
        document.getElementById('tela-pin').style.display = 'none';
        document.getElementById('app-content').style.display = 'flex';
        if (!contas.length) contas = [{nome: 'Principal', saldoInicial: 0}];
        salvar();
    } else if (modo === 'producao') {
        document.getElementById('modal-onboarding').style.display = 'none';
        document.getElementById('app-content').style.display = 'none';
        initPin();
    }
    
    atualizarMes();
    atualizar();
    
    // LIGA INPUT E BOTÃO AQUI
    const input = document.getElementById('user-input');
    const btn = document.getElementById('btn-enviar');
    
if(input) {
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            processarMensagem();
        }
    });

    console.log('Input OK');
}
    
    
    if(btn) {
        btn.addEventListener('click', processarMensagem);
        console.log('Botão OK');
    }
});



if (localStorage.getItem('bankday_tema') === 'light') {
    document.body.classList.add('light-mode');

    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = 'fas fa-sun';
}
