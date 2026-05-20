// ===== ESTADO =====
let dados = JSON.parse(localStorage.getItem('dados') || '[]');
let contas = JSON.parse(localStorage.getItem('contas') || '[]');
let cartoes = JSON.parse(localStorage.getItem('cartoes') || '[]');
let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();
let transacaoEditando = null;
let chartInstance = null;
let mostrarProjetado = false;
let ocultarValores = false;
let recognition = null;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('pin')) {
        mostrarTelaPin();
    } else {
        mostrarOnboarding();
    }
    atualizarMes();
    atualizar();
    setupInput();
    setupPinInputs();
    verificarModoTeste();
});

// ===== PIN =====
function setupPinInputs() {
    const inputs = document.querySelectorAll('.pin-input');
    if (!inputs.length) return;

    inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val;
            if (val && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            }
            const pinCompleto = Array.from(inputs).every(i => i.value);
            if (pinCompleto) {
                setTimeout(() => verificarPin(), 100);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' &&!e.target.value && idx > 0) {
                inputs[idx - 1].focus();
                inputs[idx - 1].value = '';
            }
        });

        input.addEventListener('focus', () => {
            document.getElementById('pin-erro')?.classList.add('hidden');
        });
    });
}

function verificarPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    const pinSalvo = localStorage.getItem('pin');

    if (pin.length!== 4) return;

    if (!pinSalvo) {
        localStorage.setItem('pin', pin);
        mostrarOnboarding();
        inputs.forEach(i => i.value = '');
    } else if (pin === pinSalvo) {
        mostrarApp();
        inputs.forEach(i => i.value = '');
    } else {
        const erro = document.getElementById('pin-erro');
        erro.textContent = 'PIN incorreto';
        erro.classList.remove('hidden');
        inputs.forEach(i => {
            i.value = '';
            i.style.animation = 'shake 0.3s';
            setTimeout(() => i.style.animation = '', 300);
        });
        inputs[0].focus();
    }
}

function mostrarTelaPin() {
    document.getElementById('tela-pin').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
    setTimeout(() => document.querySelector('.pin-input')?.focus(), 200);
}

function mostrarOnboarding() {
    document.getElementById('tela-pin').style.display = 'none';
    document.getElementById('modal-onboarding').style.display = 'flex';
}

function mostrarApp() {
    document.getElementById('tela-pin').style.display = 'none';
    document.getElementById('modal-onboarding').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    atualizar();
}

// ===== ONBOARDING =====
function selecionarModo(modo) {
    localStorage.setItem('modo', modo);
    if (modo === 'teste') {
        const expira = new Date();
        expira.setHours(expira.getHours() + 48);
        localStorage.setItem('teste_expira', expira.getTime());
    }
    fecharModal('modal-onboarding');
    if (modo === 'producao' &&!contas.length) {
        abrirModalConta();
    } else {
        mostrarApp();
    }
}

function verificarModoTeste() {
    const modo = localStorage.getItem('modo');
    if (modo === 'teste') {
        const expira = parseInt(localStorage.getItem('teste_expira'));
        if (Date.now() > expira) {
            alert('Período de teste expirou. App será resetado.');
            resetarApp();
        }
    }
}

// ===== INPUT CHAT =====
function setupInput() {
    const input = document.getElementById('user-input');
    const btn = document.getElementById('btn-enviar');
    input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); processarMensagem(); }
    });
    btn?.addEventListener('click', (e) => { e.preventDefault(); processarMensagem(); });
}

function processarMensagem() {
    const input = document.getElementById('user-input');
    const texto = input.value.trim();
    if (!texto) return;
    addMensagem(texto, 'user');
    input.value = '';
    const lancamento = interpretarTexto(texto);
    if (lancamento) {
        dados.push(lancamento);
        salvar();
        atualizar();
        addMensagem(`Lançado: ${lancamento.descricao} R$ ${lancamento.valor.toFixed(2)}`, 'system');
    } else {
        addMensagem('Não entendi. Ex: "cafe 15" ou "recebi 2000"', 'system');
    }
}

function interpretarTexto(texto) {
    const regexValor = /(\d+[.,]?\d*)/;
    const matchValor = texto.match(regexValor);
    if (!matchValor) return null;

    const valor = parseFloat(matchValor[1].replace(',', '.'));
    let textoLimpo = texto.toLowerCase();

    // ===== DETECTA BANCO/CARTÃO PRIMEIRO =====
    const metodo = /cartao|credito|cartão/i.test(texto)? 'cartao' : 'conta';
    let banco = metodo === 'cartao'? (cartoes[0]?.nome || 'Cartão') : (contas[0]?.nome || 'Conta');

    [...contas,...cartoes].forEach(item => {
        if (textoLimpo.includes(item.nome.toLowerCase())) {
            banco = item.nome;
            // Remove o nome do banco do texto pra não ir pra descrição
            textoLimpo = textoLimpo.replace(new RegExp(`\\b${item.nome.toLowerCase()}\\b`, 'g'), '');
        }
    });

    // ===== DESCRIÇÃO LIMPA =====
    let desc = textoLimpo;

    // 1. Remove valor
    desc = desc.replace(matchValor[0], '');

    // 2. Remove palavras-chave de ação
    const palavrasAcao = [
        'comprei','paguei','parcelei','quitei','gastei','transferi',
        'recebi','salario','salário','pagamento','de','do','da','no','na','em','por',
        'cartao','cartão','credito','crédito','conta','\\d+x','x'
    ];
    palavrasAcao.forEach(p => {
        const regex = new RegExp(`\\b${p}\\b`, 'gi');
        desc = desc.replace(regex, '');
    });

    // 3. Limpa espaços duplos e sobras
    desc = desc.replace(/\s+/g, ' ').trim();

    // 4. Primeira letra maiúscula + fallback
    desc = desc? desc.charAt(0).toUpperCase() + desc.slice(1) : 'Lançamento';

    // ===== TIPO =====
    const regexEntrada = /(recebi|salario|salário|pagamento|pix recebido)/i;
    const tipo = regexEntrada.test(texto)? 'entrada' : 'saida';

    // ===== SALDO INICIAL =====
    if (/(saldo inicial)/i.test(texto)) {
        if (!contas.length) contas.push({nome: 'Principal', saldo: 0, id: Date.now()});
        contas[0].saldo = valor;
        salvar();
        atualizar();
        addMensagem(`Saldo inicial atualizado: R$ ${valor.toFixed(2)}`, 'system');
        return null;
    }

    // ===== PARCELADO =====
    const regexParcela = /(\d+)\s*x/i;
    const matchParcela = texto.match(regexParcela);
    const parcelas = matchParcela? parseInt(matchParcela[1]) : 1;

    if (parcelas > 1) {
        const valorParcela = valor / parcelas;
        for (let i = 0; i < parcelas; i++) {
            const dataParcela = new Date();
            dataParcela.setMonth(dataParcela.getMonth() + i);
            dados.push({
                id: Date.now() + i,
                descricao: `${desc} ${i+1}/${parcelas}`,
                valor: valorParcela,
                tipo: tipo,
                metodo: metodo,
                banco: banco,
                data: dataParcela.toISOString(),
                categoria: 'Parcelado',
                texto: texto,
                parcela: i+1,
                totalParcelas: parcelas,
                contaFixa: false
            });
        }
        salvar();
        atualizar();
        addMensagem(`Parcelado: ${desc} em ${parcelas}x de R$ ${valorParcela.toFixed(2)}`, 'system');
        return null;
    }

    // ===== CATEGORIA AUTOMÁTICA =====
    const categorias = {
        'mercado|supermercado|feira|cafe|lanche|padaria|almoço|jantar|ifood|rappi': 'Alimentação',
        'uber|99|taxi|gasolina|combustivel|onibus|metro|pedagio': 'Transporte',
        'aluguel|condominio|luz|energia|energia elétrica|agua|internet|iptu': 'Moradia',
        'cinema|bar|festa|show|netflix|spotify|prime|disney': 'Lazer',
        'farmacia|medico|hospital|remedio|plano|dentista': 'Saúde',
        'curso|faculdade|livro|escola|mensalidade': 'Educação',
        'salario|freelance|pix recebido|rendimento': 'Salário'
    };
    let categoria = tipo === 'entrada'? 'Outros' : 'Outras Despesas';
    Object.keys(categorias).forEach(keys => {
        const regex = new RegExp(keys, 'i');
        if (regex.test(texto.toLowerCase())) categoria = categorias[keys];
    });

    // ===== CONTA FIXA AUTOMÁTICA =====
    const regexContaFixa = /(aluguel|luz|energia|agua|internet|condominio|netflix|spotify|mensalidade)/i;
    const contaFixa = regexContaFixa.test(texto.toLowerCase());

    return {
        id: Date.now(),
        descricao: desc,
        valor: valor,
        tipo: tipo,
        metodo: metodo,
        banco: banco,
        data: new Date().toISOString(),
        categoria: categoria,
        texto: texto,
        contaFixa: contaFixa
    };
}

    // ===== MÉTODO E BANCO =====
    const metodo = /cartao|credito|cartão/i.test(texto)? 'cartao' : 'conta';
    let banco = metodo === 'cartao'? (cartoes[0]?.nome || 'Cartão') : (contas[0]?.nome || 'Conta');
    [...contas,...cartoes].forEach(item => {
        if (texto.toLowerCase().includes(item.nome.toLowerCase())) banco = item.nome;
    });

    // ===== CATEGORIA AUTOMÁTICA =====
    const categorias = {
        'mercado|supermercado|feira': 'Alimentação',
        'cafe|lanche|padaria|almoço|jantar|ifood|rappi': 'Alimentação',
        'uber|99|taxi|gasolina|combustivel|onibus|metro': 'Transporte',
        'aluguel|condominio|luz|energia|agua|internet': 'Moradia',
        'cinema|bar|festa|show|netflix|spotify|prime': 'Lazer',
        'farmacia|medico|hospital|remedio|plano': 'Saúde',
        'curso|faculdade|livro|escola': 'Educação',
        'salario|freelance|pix recebido|rendimento': 'Salário'
    };
    let categoria = tipo === 'entrada'? 'Outros' : 'Outras Despesas';
    Object.keys(categorias).forEach(keys => {
        const regex = new RegExp(keys, 'i');
        if (regex.test(texto.toLowerCase())) categoria = categorias[keys];
    });

    return {
        id: Date.now(),
        descricao: desc,
        valor: valor,
        tipo: tipo,
        metodo: metodo,
        banco: banco,
        data: new Date().toISOString(),
        categoria: categoria,
        texto: texto
    };
}

function addMensagem(texto, tipo) {
    const chat = document.getElementById('chat-box');
    if (!chat) return;
    const msg = document.createElement('div');
    msg.className = `msg ${tipo}`;
    msg.innerHTML = `<div class="msg-bubble" ${tipo === 'user'? '' : 'onclick="clicouMsg(event)"'}><p>${texto}</p></div>`;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
    if (tipo === 'system') {
        setTimeout(() => {
            msg.style.transition = 'opacity 0.5s';
            msg.style.opacity = '0';
            setTimeout(() => msg.remove(), 500);
        }, 15000);
    }
}

function clicouMsg(e) {
    const texto = e.currentTarget.querySelector('p').textContent;
    const trans = dados.find(d => texto.includes(d.descricao) || texto.includes(d.valor.toFixed(2)));
    if (trans) abrirEditarTransacao(trans.id);
}

// ===== VOZ =====
function iniciarVoz() {
    if (!('webkitSpeechRecognition' in window)) {
        alert('Navegador não suporta voz');
        return;
    }
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.onresult = (e) => {
        document.getElementById('user-input').value = e.results[0][0].transcript;
        processarMensagem();
    };
    recognition.start();
    addMensagem('Ouvindo...', 'system');
}

// ===== CARDS E MÊS =====
function mudarMes(delta) {
    mesAtual += delta;
    if (mesAtual < 0) { mesAtual = 11; anoAtual--; }
    else if (mesAtual > 11) { mesAtual = 0; anoAtual++; }
    atualizarMes();
    atualizar();
}

function atualizarMes() {
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    document.getElementById('mesAtual').textContent = `${meses[mesAtual]} ${anoAtual}`;
}

function atualizar() {
    const dadosMes = dados.filter(d => {
        const data = new Date(d.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
    });
    const entradas = dadosMes.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
    const saidas = dadosMes.filter(d => d.tipo === 'saida').reduce((s, d) => s + d.valor, 0);
    const cartao = dadosMes.filter(d => d.metodo === 'cartao' && d.tipo === 'saida').reduce((s, d) => s + d.valor, 0);
    const saldo = entradas - saidas;
    const saldoContas = contas.reduce((s, c) => s + c.saldo, 0);
    const liquido = saldoContas + saldo;

    const fmt = (val) => ocultarValores? 'R$ ••••' : `R$ ${val.toFixed(2)}`;

    document.getElementById('card-entradas').textContent = fmt(entradas);
    document.getElementById('card-saidas').textContent = fmt(saidas);
    document.getElementById('card-saldo').textContent = fmt(saldo);
    document.getElementById('card-cartoes').textContent = fmt(cartao);
    document.getElementById('card-liquido').textContent = fmt(liquido);
}

function toggleVisibility() {
    ocultarValores =!ocultarValores;
    document.getElementById('eye-icon').className = ocultarValores? 'fas fa-eye-slash' : 'fas fa-eye';
    atualizar();
}

function toggleTheme() {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    document.getElementById('theme-icon').className = isLight? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('theme', isLight? 'light' : 'dark');
}

// ===== MODAIS =====
function abrirModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
}

function abrirExtrato(tipo = '') {
    abrirModal('modal-extrato');
    if (tipo) document.getElementById('filtro-tipo').value = tipo;
    filtrarExtrato();
}

function abrirGraficos() {
    abrirModal('modal-graficos');
    trocarGrafico('categoria');
}

function abrirModalConta() {
    abrirModal('modal-contas');
    renderTempContas();
}

function abrirModalCartao() {
    abrirModal('modal-cartao');
    renderTempCartoes();
}

// ===== EXTRATO =====
function filtrarExtrato() {
    const tipo = document.getElementById('filtro-tipo').value;
    const categoria = document.getElementById('filtro-categoria').value;
    const lista = document.getElementById('lista-extrato');

    let filtrados = dados.filter(d => {
        const data = new Date(d.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
    });

    if (tipo) filtrados = filtrados.filter(d => d.tipo === tipo || (tipo === 'cartao' && d.metodo === 'cartao'));
    if (categoria) filtrados = filtrados.filter(d => d.categoria === categoria);

    const categorias = [...new Set(dados.map(d => d.categoria))];
    document.getElementById('filtro-categoria').innerHTML = '<option value="">Todas categorias</option>' +
        categorias.map(c => `<option value="${c}">${c}</option>`).join('');

    lista.innerHTML = filtrados.length? filtrados.map(d => `
        <div class="extrato-item" onclick="abrirEditarTransacao(${d.id})">
            <div>
                <p class="extrato-desc">${d.descricao}</p>
                <p class="extrato-meta">${d.categoria} • ${d.banco} • ${new Date(d.data).toLocaleDateString('pt-BR')}</p>
            </div>
            <p class="extrato-valor ${d.tipo}">${d.tipo === 'entrada'? '+' : '-'}R$ ${d.valor.toFixed(2)}</p>
        </div>
    `).join('') : '<p class="empty">Nenhum lançamento</p>';

    const total = filtrados.reduce((s, d) => s + (d.tipo === 'entrada'? d.valor : -d.valor), 0);
    document.getElementById('total-extrato').textContent = `Total: R$ ${total.toFixed(2)}`;
}

// ===== GRÁFICOS =====
function trocarGrafico(tipo) {
    document.querySelectorAll('.grafico-tabs button').forEach(b => b.classList.remove('tab-active'));
    event?.target.classList.add('tab-active');

    const dadosMes = dados.filter(d => {
        const data = new Date(d.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual && d.tipo === 'saida';
    });

    let labels = [], valores = [];
    if (tipo === 'categoria') {
        const porCat = {};
        dadosMes.forEach(d => porCat[d.categoria] = (porCat[d.categoria] || 0) + d.valor);
        labels = Object.keys(porCat);
        valores = Object.values(porCat);
    } else if (tipo === 'cartao') {
        const porCartao = {};
        dadosMes.filter(d => d.metodo === 'cartao').forEach(d => porCartao[d.banco] = (porCartao[d.banco] || 0) + d.valor);
        labels = Object.keys(porCartao);
        valores = Object.values(porCartao);
    } else {
        const porConta = {};
        dadosMes.filter(d => d.metodo === 'conta').forEach(d => porConta[d.banco] = (porConta[d.banco] || 0) + d.valor);
        labels = Object.keys(porConta);
        valores = Object.values(porConta);
    }

    if (chartInstance) chartInstance.destroy();
    const ctx = document.getElementById('grafico').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// ===== CONTAS/CARTÕES =====
let tempContas = [];
let tempCartoes = [];

function addTempConta() {
    const nome = document.getElementById('conta-nome').value.trim();
    const saldo = parseFloat(document.getElementById('conta-saldo').value) || 0;
    if (!nome) return alert('Nome obrigatório');
    tempContas.push({nome, saldo, id: Date.now()});
    document.getElementById('conta-nome').value = '';
    document.getElementById('conta-saldo').value = '';
    renderTempContas();
}

function renderTempContas() {
    document.getElementById('lista-contas-temp').innerHTML = tempContas.map((c, i) => `
        <div class="temp-item">
            <span>${c.nome} - R$ ${c.saldo.toFixed(2)}</span>
            <button onclick="tempContas.splice(${i}, 1); renderTempContas()"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

function salvarContas() {
    contas = [...contas,...tempContas];
    tempContas = [];
    salvar();
    atualizar();
    fecharModal('modal-contas');
}

function addTempCartao() {
    const nome = document.getElementById('cartao-nome').value.trim();
    const limite = parseFloat(document.getElementById('cartao-limite').value) || 0;
    const fechamento = parseInt(document.getElementById('cartao-fechamento').value);
    const vencimento = parseInt(document.getElementById('cartao-vencimento').value);
    if (!nome) return alert('Nome obrigatório');
    tempCartoes.push({nome, limite, fechamento, vencimento, id: Date.now()});
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-limite').value = '';
    document.getElementById('cartao-fechamento').value = '';
    document.getElementById('cartao-vencimento').value = '';
    renderTempCartoes();
}

function renderTempCartoes() {
    document.getElementById('lista-cartoes-temp').innerHTML = tempCartoes.map((c, i) => `
        <div class="temp-item">
            <span>${c.nome} - Limite R$ ${c.limite.toFixed(2)}</span>
            <button onclick="tempCartoes.splice(${i}, 1); renderTempCartoes()"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

function salvarCartoes() {
    cartoes = [...cartoes,...tempCartoes];
    tempCartoes = [];
    salvar();
    atualizar();
    fecharModal('modal-cartao');
}

// ===== EDITAR TRANSAÇÃO =====
function abrirEditarTransacao(id) {
    transacaoEditando = dados.find(d => d.id === id);
    if (!transacaoEditando) return;

    document.getElementById('edit-desc').value = transacaoEditando.descricao;
    document.getElementById('edit-valor').value = transacaoEditando.valor;
    document.getElementById('edit-data').value = transacaoEditando.data.split('T')[0];
    document.getElementById('edit-tipo').value = transacaoEditando.tipo;
    document.getElementById('edit-metodo').value = transacaoEditando.metodo;
    document.getElementById('edit-conta-fixa').checked = transacaoEditando.contaFixa || false;

    atualizarCategorias();
    atualizarContasModal();
    document.getElementById('edit-categoria').value = transacaoEditando.categoria;
    document.getElementById('edit-banco').value = transacaoEditando.banco;

    abrirModal('modal-editar');
}

function salvarEdicao() {
    if (!transacaoEditando) return;
    transacaoEditando.descricao = document.getElementById('edit-desc').value;
    transacaoEditando.valor = parseFloat(document.getElementById('edit-valor').value);
    transacaoEditando.data = new Date(document.getElementById('edit-data').value).toISOString();
    transacaoEditando.tipo = document.getElementById('edit-tipo').value;
    transacaoEditando.metodo = document.getElementById('edit-metodo').value;
    transacaoEditando.categoria = document.getElementById('edit-categoria').value;
    transacaoEditando.banco = document.getElementById('edit-banco').value;
    transacaoEditando.contaFixa = document.getElementById('edit-conta-fixa').checked;
    salvar();
    atualizar();
    fecharModal('modal-editar');
    transacaoEditando = null;
}
function deletarTransacao() {
    if (!transacaoEditando) return;
    if (confirm('Excluir lançamento?')) {
        dados = dados.filter(d => d.id!== transacaoEditando.id);
        salvar();
        atualizar();
        fecharModal('modal-editar');
        transacaoEditando = null;
    }
}

// ===== MENU MAIS =====
function abrirMenuMais(e) {
    e.stopPropagation();
    document.getElementById('menu-mais').classList.toggle('hidden');
}

function fecharMenuMais() {
    document.getElementById('menu-mais').classList.add('hidden');
}

function toggleProjetado() {
    mostrarProjetado =!mostrarProjetado;
    atualizar();
}

// ===== RESET =====
function resetarApp() {
    fecharMenuMais(); // fecha o menu antes
    if (confirm('ATENÇÃO: Isso vai apagar TUDO\n\n• Todas as transações\n• Contas e cartões\n• PIN de acesso\n\nTem certeza que deseja resetar o app?')) {
        localStorage.clear();
        location.reload();
    }
}

function resetarTransacoes() {
    if (confirm('Limpar todos lançamentos deste mês?')) {
        dados = dados.filter(d => {
            const data = new Date(d.data);
            return!(data.getMonth() === mesAtual && data.getFullYear() === anoAtual);
        });
        salvar();
        atualizar();
        addMensagem('Lançamentos do mês apagados', 'system');
        fecharMenuMais();
    }
}

// ===== ABAS =====
function trocarAba(aba, e) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    e?.currentTarget.classList.add('active');
    if (aba === 'chat') {
        document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;
    }
}

// ===== PERSISTÊNCIA =====
function salvar() {
    localStorage.setItem('dados', JSON.stringify(dados));
    localStorage.setItem('contas', JSON.stringify(contas));
    localStorage.setItem('cartoes', JSON.stringify(cartoes));
}

// ===== CLICK FORA =====
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-mais') &&!e.target.closest('.nav-item')) {
        fecharMenuMais();
    }
});

// ===== TEMA INICIAL =====
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light');
    const el = document.getElementById('theme-icon');
    if (el) el.className = 'fas fa-sun';
}
