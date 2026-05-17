const API_URL = '/api/orders';
let orders = [];
let syncQueue = [];
let isOnline = navigator.onLine;

// DOM
const ordersContainer = document.getElementById('orders-list');
const emptyState = document.getElementById('empty-state');
const statusDot = document.getElementById('status-dot');
const statusLabel = document.getElementById('status-label');
const filterStatus = document.getElementById('filter-status');
const filterPriority = document.getElementById('filter-priority');
const addBtn = document.getElementById('add-btn');
const syncBtn = document.getElementById('sync-btn');
const syncBtnText = document.getElementById('sync-btn-text');
const syncBadge = document.getElementById('sync-badge');
const modal = document.getElementById('modal');
const closeModalBtn = document.querySelector('.close-btn');
const orderForm = document.getElementById('order-form');

document.addEventListener('DOMContentLoaded', () => {
  loadLocalData();
  renderOrders();
  updateOnlineStatus();
  updateSyncBadge();

  window.addEventListener('online', () => { updateOnlineStatus(); attemptSync(); });
  window.addEventListener('offline', updateOnlineStatus);
  filterStatus.addEventListener('change', renderOrders);
  filterPriority.addEventListener('change', renderOrders);
  addBtn.addEventListener('click', openAddModal);
  closeModalBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  orderForm.addEventListener('submit', handleAddOrder);
  syncBtn.addEventListener('click', attemptSync);
  if (isOnline) attemptSync();
});

// localStorage
function loadLocalData() {
  try {
    orders = JSON.parse(localStorage.getItem('orders') || '[]');
    syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
  } catch (e) {
    orders = [];
    syncQueue = [];
  }
}

function saveLocalData() {
  localStorage.setItem('orders', JSON.stringify(orders));
  localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  updateSyncBadge();
}

// Онлайн/офлайн
function updateOnlineStatus() {
  isOnline = navigator.onLine;
  statusDot.className = `dot ${isOnline ? 'online' : 'offline'}`;
  statusLabel.textContent = isOnline ? 'Онлайн' : 'Офлайн';
}

function updateSyncBadge() {
  const count = syncQueue.length;
  if (count > 0) {
    syncBadge.textContent = count;
    syncBadge.classList.remove('hidden');
  } else {
    syncBadge.classList.add('hidden');
  }
}

// Рендер
function renderOrders() {
  const statusFilter = filterStatus.value;
  const priorityFilter = filterPriority.value;
  let filtered = orders;
  if (statusFilter) filtered = filtered.filter(o => o.status === statusFilter);
  if (priorityFilter) filtered = filtered.filter(o => o.priority === priorityFilter);

  if (filtered.length === 0) {
    ordersContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    ordersContainer.innerHTML = filtered.map(createOrderCard).join('');
  }

  // Привязываем обработчики кнопок
  document.querySelectorAll('.card-delete').forEach(btn => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });
  document.querySelectorAll('.card-status-btn').forEach(btn => {
    btn.addEventListener('click', () => showStatusEdit(btn.dataset.id));
  });
}

function createOrderCard(order) {
  const created = new Date(order.createdAt).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  const isTemp = order.id.toString().startsWith('temp_');
  const isInQueue = syncQueue.some(item =>
    (item.action === 'create' && item.data?.id === order.id) ||
    (item.action === 'update' && item.data?.id === order.id)
  );
  const isSynced = !isTemp && !isInQueue;

  const badgeClass = isSynced ? 'synced' : 'draft';
  const badgeText = isSynced ? 'Сохранено' : 'Черновик';

  return `
    <div class="order-card" data-id="${order.id}">
      <span class="sync-status-badge ${badgeClass}">${badgeText}</span>
      <div class="card-header">
        <span class="room-info">№ ${escapeHtml(order.roomNumber)}</span>
        <span class="card-date">${created}</span>
      </div>
      <h3>${escapeHtml(order.serviceType)}</h3>
      <p>${escapeHtml(order.description)}</p>
      <div class="card-footer">
        <span class="priority-label">
          Приоритет: <span class="priority-tag prio-${order.priority}">${order.priority}</span>
        </span>
        <span class="status-label">
          Статус: <span class="status-text">${order.status}</span>
        </span>
      </div>
      <div class="card-actions" id="actions-${order.id}">
        <button class="btn-small card-status-btn" data-id="${order.id}">Сменить статус</button>
        <button class="btn-small card-delete" data-id="${order.id}">Удалить</button>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Редактирование статуса на месте
function showStatusEdit(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  const actionsDiv = document.getElementById(`actions-${id}`);
  document.getElementById(`status-editor-${id}`)?.remove();

  const editorHtml = `
    <div class="status-edit" id="status-editor-${id}">
      <select id="status-select-${id}">
        <option value="Новая" ${order.status==='Новая'?'selected':''}>Новая</option>
        <option value="В работе" ${order.status==='В работе'?'selected':''}>В работе</option>
        <option value="Выполнена" ${order.status==='Выполнена'?'selected':''}>Выполнена</option>
        <option value="Отменена" ${order.status==='Отменена'?'selected':''}>Отменена</option>
      </select>
      <button class="confirm-btn" data-id="${id}">OK</button>
      <button class="cancel-btn" data-id="${id}">Отмена</button>
    </div>
  `;
  actionsDiv.insertAdjacentHTML('beforebegin', editorHtml);

  document.querySelector(`#status-editor-${id} .confirm-btn`).onclick = () => {
    const newStatus = document.getElementById(`status-select-${id}`).value;
    applyStatusChange(id, newStatus);
    document.getElementById(`status-editor-${id}`).remove();
  };
  document.querySelector(`#status-editor-${id} .cancel-btn`).onclick = () => {
    document.getElementById(`status-editor-${id}`).remove();
  };
}

async function applyStatusChange(id, newStatus) {
  const order = orders.find(o => o.id === id);
  if (!order || order.status === newStatus) return;

  order.status = newStatus;
  saveLocalData();
  renderOrders();

  if (!isOnline) {
    addToSyncQueue('update', { id, payload: { status: newStatus } });
    return;
  }

  const res = await updateOrderOnServer(id, { status: newStatus });
  if (!res.success) {
    if (res.status === 404 && id.startsWith('temp_')) {
      // Заявка ещё не создана на сервере, просто оставим локально
      console.warn('Обновление временной заявки — будет синхронизировано позже');
    } else {
      alert(`Ошибка обновления статуса: ${res.error}`);
      // Откатываем? Или оставляем как есть и добавляем в очередь
    }
    addToSyncQueue('update', { id, payload: { status: newStatus } });
  }
}

// Добавление заявки
function openAddModal() {
  orderForm.reset();
  document.getElementById('status').value = 'Новая';
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
}

async function handleAddOrder(e) {
  e.preventDefault();
  const tempId = 'temp_' + Date.now();
  const newOrder = {
    id: tempId,
    roomNumber: document.getElementById('roomNumber').value.trim(),
    serviceType: document.getElementById('serviceType').value,
    description: document.getElementById('description').value.trim(),
    priority: document.getElementById('priority').value,
    status: document.getElementById('status').value,
    createdAt: new Date().toISOString()
  };

  orders.unshift(newOrder);
  saveLocalData();
  renderOrders();
  closeModal();

  if (!isOnline) {
    addToSyncQueue('create', newOrder);
    return;
  }

  const res = await createOrderOnServer(newOrder);
  if (!res.success) {
    alert(`Не удалось сохранить заявку на сервер:\n${res.errors?.join('\n') || res.error}`);
    addToSyncQueue('create', newOrder);
  }
  // успех уже обработан внутри createOrderOnServer
}

async function createOrderOnServer(order) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomNumber: order.roomNumber,
        serviceType: order.serviceType,
        description: order.description,
        priority: order.priority,
        status: order.status
      })
    });

    if (response.status === 400) {
      const err = await response.json();
      return { success: false, errors: err.errors };
    }
    if (!response.ok) {
      const err = await response.json();
      return { success: false, error: err.error || `HTTP ${response.status}` };
    }

    const serverOrder = await response.json();
    // Заменяем временную заявку на серверную
    const index = orders.findIndex(o => o.id === order.id);
    if (index !== -1) orders[index] = serverOrder;
    else orders.push(serverOrder);

    // Обновляем все действия в очереди, связанные с этим временным ID
    syncQueue = syncQueue.map(item => {
      if (item.data?.id === order.id) {
        return { ...item, data: { ...item.data, id: serverOrder.id } };
      }
      return item;
    });
    // Удаляем само действие создания
    syncQueue = syncQueue.filter(item => !(item.action === 'create' && item.data?.id === serverOrder.id));

    saveLocalData();
    renderOrders();
    return { success: true };
  } catch (err) {
    console.error('Сеть недоступна:', err);
    return { success: false, error: 'Нет соединения с сервером' };
  }
}

// Удаление
async function handleDelete(id) {
  orders = orders.filter(o => o.id !== id);
  syncQueue = syncQueue.filter(item => item.data?.id !== id);
  saveLocalData();
  renderOrders();

  if (!isOnline) {
    addToSyncQueue('delete', { id });
    return;
  }
  const res = await deleteOrderOnServer(id);
  if (!res.success) {
    if (res.status === 404 && id.startsWith('temp_')) {
      // ок, на сервере нет
    } else {
      alert(`Ошибка удаления: ${res.error}`);
      addToSyncQueue('delete', { id });
    }
  }
}

async function deleteOrderOnServer(id) {
  try {
    const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    if (response.ok || response.status === 404) return { success: true };
    const err = await response.json();
    return { success: false, error: err.error, status: response.status };
  } catch (err) {
    return { success: false, error: 'Нет соединения' };
  }
}

async function updateOrderOnServer(id, payload) {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) return { success: true };
    if (response.status === 404) return { success: false, status: 404, error: 'Заявка не найдена на сервере' };
    const err = await response.json();
    return { success: false, error: err.error, status: response.status };
  } catch (err) {
    return { success: false, error: 'Нет соединения' };
  }
}

// Синхронизация
function addToSyncQueue(action, data) {
  syncQueue.push({ action, data, timestamp: Date.now() });
  saveLocalData();
}

async function attemptSync() {
  if (!isOnline) {
    alert('Нет сети. Синхронизация невозможна.');
    return;
  }
  if (syncQueue.length === 0) {
    await refreshFromServer();
    return;
  }

  syncBtn.disabled = true;
  syncBtnText.textContent = 'Синхронизация...';

  const queueCopy = [...syncQueue];
  const failed = [];

  for (const item of queueCopy) {
    let res = { success: false, error: 'Неизвестная ошибка' };
    switch (item.action) {
      case 'create':
        res = await createOrderOnServer(item.data);
        break;
      case 'update':
        res = await updateOrderOnServer(item.data.id, item.data.payload);
        break;
      case 'delete':
        res = await deleteOrderOnServer(item.data.id);
        break;
    }
    if (!res.success) {
      // Если 404 для временного ID , считаем, что заявка ещё не создана, пропускаем пока
      if (res.status === 404 && item.data?.id?.startsWith?.('temp_')) {
        // оставим в очереди, позже создастся
        failed.push(item);
      } else {
        failed.push(item);
      }
    }
  }

  syncQueue = failed;
  saveLocalData();
  await refreshFromServer();

  syncBtn.disabled = false;
  syncBtnText.textContent = 'Синхронизация';

  if (failed.length > 0) {
    alert(`Не удалось синхронизировать ${failed.length} действий. Проверьте соединение или данные.`);
  }
}

async function refreshFromServer() {
  try {
    const response = await fetch(API_URL);
    if (response.ok) {
      const serverOrders = await response.json();
      const serverIds = new Set(serverOrders.map(o => o.id));
      const localOnly = orders.filter(o => o.id.startsWith('temp_') || !serverIds.has(o.id));
      orders = [...serverOrders, ...localOnly];
      saveLocalData();
      renderOrders();
    }
  } catch (err) {
    console.warn('Не удалось обновить список с сервера');
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('SW registered'))
    .catch(err => console.log('SW error:', err));
}