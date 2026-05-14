// ===== CONFIG E ESTADO =====
let dados = JSON.parse(localStorage.getItem('dados') || '[]');
let contas = JSON.parse(localStorage.getItem('contas') || '[]');
let cartoes = JSON.parse(localStorage.getItem('cartoes') || '[]');
let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();
let html5QrCode = null;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('pin')) {
        mostrarTelaPin();
    } else {
        mostrarOnboarding();
    }
    atualizarMes();
    atualizar();
});

function mostrarTelaPin() {
    document.getElementById('tela-pin').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
    setupPinInputs();
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

// ===== PIN =====
function setupPinInputs() {
    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            if (e.target.value && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            }
            if (idx === inputs.length - 1 && e.target.value) {
                verificarPin();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' &&!e.target.value && idx > 0) {
                inputs[idx - 1].focus();
            }
        });
    });
    inputs[0].focus();
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

function esqueciPin() {
    if (confirm('Isso vai apagar todos os dados. Continuar?')) {
        localStorage.clear();
        location.reload();
    }
}

// ===== ONBOARDING =====
function selecionarModo(modo) {
    localStorage.setItem('modo', modo);
    document.getElementById('modal-onboarding').style.display = 'none';
    if (modo === 'producao' &&!contas.length) {
        abrirModal('modal-contas');
    } else {
        mostrarApp();
    }
}

// ===== SCAN QR CODE =====
function abrirScan() {
    document.getElementById('modal-scan').style.display = 'flex';
    html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            processarQRCode(decodedText);
            fecharScan();
        },
        (error) => {}
    ).catch(err => {
        alert('Erro ao abrir câmera: ' + err);
        fecharScan();
    });
}

function fecharScan() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('modal-scan').style.display = 'none';
            html5QrCode = null;
        }).catch(() => {
            document.getElementById('modal-scan').style.display = 'none';
        });
    } else {
        document.getElementById('modal-scan').style.display = 'none';
    }
}

function processarQRCode(texto) {
    if (texto.startsWith('000201')) {
        const boleto = parsePixQRCode(texto);
        if (boleto && boleto.valor > 0) {
            const confirmar = confirm(`Boleto Pix detectado:\n\nBeneficiário: ${boleto.beneficiario}\nValor: R$ ${boleto.valor.toFixed(2)}\n\nLançar como despesa?`);
            if (confirmar) {
                if (!contas.length) contas = [{nome: 'Principal', saldo: 0}];
                dados.push({
                    id: Date.now(),
                    descricao: `Boleto ${boleto.beneficiario}`,
                    valor: boleto.valor,
                    tipo: 'saida',
                    metodo: 'conta',
                    banco: contas[0].nome,
                    data: new Date().toISOString(),
                    categoria: 'Outras Despesas',
                    texto: texto
                });
                salvar();
                atualizar();
                addMensagem(`Boleto lançado: R$ ${boleto.valor.toFixed(2)} - ${boleto.beneficiario}`, 'system');
            }
        } else {
            alert('QR Code Pix sem valor identificado');
        }
    } else {
        addMensagem(`QR Code: ${texto}`, 'user');
    }
}

function parsePixQRCode(qr) {
    try {
        const valorMatch = qr.match(/54(\d{2})(\d+\.?\d*)/);
        const valor = valorMatch? parseFloat(valorMatch[2]) : 0;
        const nomeMatch = qr.match(/59(\d{2})([^0-9]{2,})/);
        const beneficiario = nomeMatch? nomeMatch[2].substring(0, parseInt(nomeMatch[1])) : 'Desconhecido';
        return { valor, beneficiario };
    } catch (e) {
        console.error('Erro parse QR:', e);
        return null;
    }
}

// ===== CHAT E LANÇAMENTOS =====
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
        addMensagem('Não entendi. Ex: "mercado 150" ou "recebi 2000"', 'system');
    }
}

function interpretarTexto(texto) {
    const regex = /(.+?)\s+(\d+[.,]?\d*)/;
    const match = texto.match(regex);
    if (!match) return null;

    const descricao = match[1].trim();
    const valor = parseFloat(match[2].replace(',', '.'));
    const tipo = texto.toLowerCase().includes('recebi') || texto.toLowerCase().includes('salario')? 'entrada' : 'saida';

    if (!contas.length) contas = [{nome: 'Principal', saldo: 0}];

    return {
        id: Date.now(),
        descricao: descricao,
        valor: valor,
        tipo: tipo,
        metodo: 'conta',
        banco: contas[0].nome,
        data: new Date().toISOString(),
        categoria: tipo === 'entrada'? 'Salário' : 'Outras Despesas',
        texto: texto
    };
}

function addMensagem(texto, tipo) {
    const chat = document.getElementById('chat-box');
    const msg = document.createElement('div');
    msg.className = `msg ${tipo}`;
    msg.innerHTML = `<div class="msg-bubble"><p>${texto}</p></div>`;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

// ===== MÊS E CARDS =====
function mudarMes(delta) {
    mesAtual += delta;
    if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
    } else if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
    }
    atualizarMes();
    atualizar();
}

function atualizarMes() {
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('mesAtual').textContent = `${meses[mesAtual]} ${anoAtual}`;
}

function atualizar() {
    const dadosMes = dados.filter(d => {
        const data = new Date(d.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
    });

    const entradas = dadosMes.filter(d => d.tipo === 'entrada').reduce((s, d) => s + d.valor, 0);
    const saidas = dadosMes.filter(d => d.tipo === 'saida').reduce((s, d) => s + d.valor, 0);
    const cartao = dadosMes.filter(d => d.metodo === 'cartao').reduce((s, d) => s + d.valor, 0);
    const saldo = entradas - saidas;

    document.getElementById('card-entradas').textContent = `R$ ${entradas.toFixed(2)}`;
    document.getElementById('card-saidas').textContent = `R$ ${saidas.toFixed(2)}`;
    document.getElementById('card-saldo').textContent = `R$ ${saldo.toFixed(2)}`;
    document.getElementById('card-cartoes').textContent = `R$ ${cartao.toFixed(2)}`;
    document.getElementById('card-liquido').textContent = `R$ ${saldo.toFixed(2)}`;
}

// ===== MODAIS =====
function abrirModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
}

function abrirExtrato(tipo) {
    abrirModal('modal-extrato');
    filtrarExtrato(tipo);
}

// ===== CONTAS E CARTÕES =====
function addTempConta() {
    const nome = document.getElementById('conta-nome').value;
    const saldo = parseFloat(document.getElementById('conta-saldo').value) || 0;
    if (!nome) return;

    contas.push({ nome, saldo });
    document.getElementById('conta-nome').value = '';
    document.getElementById('conta-saldo').value = '';
    renderTempContas();
}

function addTempCartao() {
    const nome = document.getElementById('cartao-nome').value;
    const fechamento = document.getElementById('cartao-fechamento').value;
    const vencimento = document.getElementById('cartao-vencimento').value;
    if (!nome) return;

    cartoes.push({ nome, fechamento, vencimento });
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-fechamento').value = '';
    document.getElementById('cartao-vencimento').value = '';
    renderTempCartoes();
}

function renderTempContas() {
    const lista = document.getElementById('lista-contas-temp');
    lista.innerHTML = contas.map((c, i) => `
        <div class="item-temp">
            <span>${c.nome} - R$ ${c.saldo.toFixed(2)}</span>
            <button onclick="contas.splice(${i},1); renderTempContas()">X</button>
        </div>
    `).join('');
}

function renderTempCartoes() {
    const lista = document.getElementById('lista-cartoes-temp');
    lista.innerHTML = cartoes.map((c, i) => `
        <div class="item-temp">
            <span>${c.nome}</span>
            <button onclick="cartoes.splice(${i},1); renderTempCartoes()">X</button>
        </div>
    `).join('');
}

function finalizarCadastro() {
    salvar();
    fecharModal('modal-contas');
    mostrarApp();
}

function filtrarExtrato(tipo = '') {
    const lista = document.getElementById('lista-extrato');
    const filtroTipo = tipo || document.getElementById('filtro-tipo')?.value || '';

    let dadosFiltrados = dados.filter(d => {
        const data = new Date(d.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
    });

    if (filtroTipo) {
        if (filtroTipo === 'cartao') {
            dadosFiltrados = dadosFiltrados.filter(d => d.metodo === 'cartao');
        } else {
            dadosFiltrados = dadosFiltrados.filter(d => d.tipo === filtroTipo);
        }
    }

    // Ordena do mais novo pro mais antigo
    dadosFiltrados.sort((a, b) => new Date(b.data) - new Date(a.data));

    lista.innerHTML = dadosFiltrados.map(d => `
        <div class="extrato-item" onclick="abrirEditarTransacao(${d.id})">
            <div class="extrato-item-info">
                <p class="extrato-item-titulo">${d.descricao}</p>
                <p class="extrato-item-meta">${new Date(d.data).toLocaleDateString()} - ${d.categoria} - ${d.banco}</p>
            </div>
            <div class="extrato-item-valor text-${d.tipo === 'entrada'? 'emerald' : 'rose'}">
                ${d.tipo === 'entrada'? '+' : '-'} R$ ${d.valor.toFixed(2)}
            </div>
        </div>
    `).join('');

    const total = dadosFiltrados.reduce((s, d) => s + (d.tipo === 'entrada'? d.valor : -d.valor), 0);
    document.getElementById('total-extrato').textContent = `Total: R$ ${total.toFixed(2)}`;
}
// ===== OUTRAS FUNÇÕES =====
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const icon = document.getElementById('theme-icon');
    icon.className = document.body.classList.contains('light-mode')? 'fas fa-sun' : 'fas fa-moon';
}

function toggleVisibility() {
    const icon = document.getElementById('eye-icon');
    const oculto = icon.className.includes('fa-eye-slash');
    icon.className = oculto? 'fas fa-eye' : 'fas fa-eye-slash';
    document.querySelectorAll('.val').forEach(el => {
        el.style.filter = oculto? 'none' : 'blur(8px)';
    });
}

function toggleMenu() {
    document.getElementById('menuDropdown').classList.toggle('hidden');
}

function trocarAba(aba, e) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    e.currentTarget.classList.add('active');
    if (aba === 'extrato') abrirModal('modal-extrato');
    if (aba === 'graficos') abrirModal('modal-graficos');
}

function salvar() {
    localStorage.setItem('dados', JSON.stringify(dados));
    localStorage.setItem('contas', JSON.stringify(contas));
    localStorage.setItem('cartoes', JSON.stringify(cartoes));
}

function resetarTransacoes() {
    if (confirm('Apagar todas as transações?')) {
        dados = [];
        salvar();
        atualizar();
    }
}

function resetarApp() {
    if (confirm('Resetar app completo?')) {
        localStorage.clear();
        location.reload();
    }
}

// ===== EDITAR/DELETAR TRANSAÇÃO =====
let transacaoEditando = null;

function abrirEditarTransacao(id) {
    transacaoEditando = dados.find(d => d.id === id);
    if (!transacaoEditando) return;

    document.getElementById('edit-desc').value = transacaoEditando.descricao;
    document.getElementById('edit-valor').value = transacaoEditando.valor;
    document.getElementById('edit-data').value = new Date(transacaoEditando.data).toISOString().split('T')[0];
    document.getElementById('edit-tipo').value = transacaoEditando.tipo;
    document.getElementById('edit-metodo').value = transacaoEditando.metodo;

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

    salvar();
    atualizar();
    filtrarExtrato();
    fecharModal('modal-editar');
    addMensagem(`Lançamento editado: ${transacaoEditando.descricao}`, 'system');
    transacaoEditando = null;
}

function deletarTransacao() {
    if (!transacaoEditando) return;
    if (!confirm('Apagar esse lançamento?')) return;

    dados = dados.filter(d => d.id!== transacaoEditando.id);
    salvar();
    atualizar();
    filtrarExtrato();
    fecharModal('modal-editar');
    addMensagem(`Lançamento apagado: ${transacaoEditando.descricao}`, 'system');
    transacaoEditando = null;
}

function atualizarCategorias() {
    const tipo = document.getElementById('edit-tipo').value;
    const select = document.getElementById('edit-categoria');

    const categoriasEntrada = ['Salário', 'Freelance', 'Vendas', 'Investimentos', 'Outros'];
    const categoriasSaida = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Assinaturas', 'Outras Despesas'];

    const categorias = tipo === 'entrada'? categoriasEntrada : categoriasSaida;

    select.innerHTML = categorias.map(c => `<option value="${c}">${c}</option>`).join('');
}

function atualizarContasModal() {
    const metodo = document.getElementById('edit-metodo').value;
    const select = document.getElementById('edit-banco');

    const opcoes = metodo === 'cartao'? cartoes : contas;

    select.innerHTML = opcoes.map(o => `<option value="${o.nome}">${o.nome}</option>`).join('');
}

// ===== FIX INPUT =====
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('user-input');
    const btn = document.getElementById('btn-enviar');

    // Enter pra enviar
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            processarMensagem();
        }
    });

    // Click no botão
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        processarMensagem();
    });
});

// Garante que a função existe
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
        addMensagem('Não entendi. Ex: "mercado 150" ou "recebi 2000"', 'system');
    }
}

function addMensagem(texto, tipo) {
    const chat = document.getElementById('chat-box');
    if (!chat) return;
    const msg = document.createElement('div');
    msg.className = `msg ${tipo}`;
    msg.innerHTML = `<div class="msg-bubble"><p>${texto}</p></div>`;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

function interpretarTexto(texto) {
    const regex = /(.+?)\s+(\d+[.,]?\d*)/;
    const match = texto.match(regex);
    if (!match) return null;

    const descricao = match[1].trim();
    const valor = parseFloat(match[2].replace(',', '.'));
    const tipo = /recebi|salario|entrada/i.test(texto)? 'entrada' : 'saida';

    if (!contas.length) contas = [{nome: 'Principal', saldo: 0}];

    return {
        id: Date.now(),
        descricao: descricao,
        valor: valor,
        tipo: tipo,
        metodo: 'conta',
        banco: contas[0].nome,
        data: new Date().toISOString(),
        categoria: tipo === 'entrada'? 'Salário' : 'Outras Despesas',
        texto: texto
    };
}

// Stubs que ainda faltam implementar
function toggleProjetado() { alert('Em breve'); }
function lerArquivoExtrato(e) { alert('Em breve'); }
function executarImportacao() { alert('Em breve'); }
function trocarGrafico(t) { alert('Em breve'); }
function atualizarCategorias() {}
function atualizarContasModal() {}
function deletarTransacao() {}
function salvarEdicao() {}
