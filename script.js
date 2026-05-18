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
});

// ===== PIN =====
function setupPinInputs() {
    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            if (e.target.value && idx < inputs.length - 1) inputs[idx + 1].focus();
            if (idx === inputs.length - 1 && e.target.value) verificarPin();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' &&!e.target.value && idx > 0) inputs[idx - 1].focus();
        });
    });
}

function verificarPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    const pinSalvo = localStorage.getItem('pin');
    if (!pinSalvo) {
        localStorage.setItem('pin', pin);
        mostrarOnboarding();
    } else if (pin === pinSalvo) {
        mostrarApp();
    } else {
        document.getElementById('pin-erro').textContent = 'PIN incorreto';
        document.getElementById('pin-erro').classList.remove('hidden');
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
    }
}

function mostrarTelaPin() {
    document.getElementById('tela-pin').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
    setTimeout(() => document.querySelector('.pin-input')?.focus(), 100);
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

// ===== INTERPRETAÇÃO AUTOMÁTICA =====
function interpretarTexto(texto) {
    const regexValor = /(\d+[.,]?\d*)/;
    const matchValor = texto.match(regexValor);
    if (!matchValor) return null;
    const valor = parseFloat(matchValor[1].replace(',', '.'));
    let descricao = texto.replace(matchValor[0], '').trim();
    
    // SAÍDA: Comprei/Paguei/Parcelei/Quitei/Gastei/Transferi
    const regexSaida = /(comprei|paguei|parcelei|quitei|gastei|transferi)/i;
    // ENTRADA: Recebi
    const regexEntrada = /(recebi)/i;
    // SALDO INICIAL
    const regexSaldo = /(saldo inicial)/i;
    
    const tipo = regexEntrada.test(texto)? 'entrada' : 'saida';
    
    // Parcelado: "em 12x" ou "12x"
    const regexParcela = /(\d+)\s*x/i;
    const matchParcela = texto.match(regexParcela);
    const parcelas = matchParcela? parseInt(matchParcela[1]) : 1;
    
    // Cartão ou Conta
    const metodo = /cartao|credito|cartão/i.test(texto)? 'cartao' : 'conta';
    
    // Detecta banco/cartão mencionado
    let banco = metodo === 'cartao'? (cartoes[0]?.nome || 'Cartão') : (contas[0]?.nome || 'Conta');
    [...contas,...cartoes].forEach(item => {
        if (texto.toLowerCase().includes(item.nome.toLowerCase())) banco = item.nome;
    });
    
    // Categoria automática
    const categorias = {
        'mercado': 'Alimentação', 'cafe': 'Alimentação', 'almoço': 'Alimentação',
        'uber': 'Transporte', 'gasolina': 'Transporte', 'onibus': 'Transporte',
        'aluguel': 'Moradia', 'luz': 'Moradia', 'agua': 'Moradia',
        'cinema': 'Lazer', 'bar': 'Lazer',
        'farmacia': 'Saúde', 'medico': 'Saúde',
        'curso': 'Educação', 'livro': 'Educação',
        'netflix': 'Assinaturas', 'spotify': 'Assinaturas',
        'salario': 'Salário', 'freelance': 'Freelance'
    };
    let categoria = tipo === 'entrada'? 'Outros' : 'Outras Despesas';
    Object.keys(categorias).forEach(key => {
        if (descricao.toLowerCase().includes(key)) categoria = categorias[key];
    });
    
    if (regexSaldo.test(texto)) {
        if (!contas.length) contas.push({nome: 'Principal', saldo: 0, id: Date.now()});
        contas[0].saldo = valor;
        salvar();
        atualizar();
        return null;
    }
    
    if (parcelas > 1) {
        const valorParcela = valor / parcelas;
        for (let i = 0; i < parcelas; i++) {
            const dataParcela = new Date();
            dataParcela.setMonth(dataParcela.getMonth() + i);
            dados.push({
                id: Date.now() + i,
                descricao: `${descricao} ${i+1}/${parcelas}`,
                valor: valorParcela,
                tipo: tipo,
                metodo: metodo,
                banco: banco,
                data: dataParcela.toISOString(),
                categoria: 'Parcelado',
                texto: texto,
                parcela: i+1,
                totalParcelas: parcelas
            });
        }
        salvar();
        atualizar();
        addMensagem(`Parcelado: ${descricao} em ${parcelas}x de R$ ${valorParcela.toFixed(2)}`, 'system');
        return null;
    }
    
    return {
        id: Date.now(),
        descricao: descricao || (tipo === 'entrada'? 'Receita' : 'Despesa'),
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
    
    document.getElementById('card-entradas').textContent = `R$ ${entradas.toFixed(2)}`;
    document.getElementById('card-saidas').textContent = `R$ ${saidas.toFixed(2)}`;
    document.getElementById('card-saldo').textContent = `R$ ${saldo.toFixed(2)}`;
    document.getElementById('card-cartoes').textContent = `R$ ${cartao.to
