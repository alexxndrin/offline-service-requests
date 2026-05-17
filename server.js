const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'orders.json');

function readOrders() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Ошибка чтения orders.json:', err);
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Валидация с понятными сообщениями
function validateOrder(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    if (!body.roomNumber || body.roomNumber.toString().trim() === '')
      errors.push('Номер комнаты обязателен');
    if (!body.serviceType || body.serviceType.toString().trim() === '')
      errors.push('Тип услуги обязателен');
    if (!body.description || body.description.toString().trim() === '')
      errors.push('Описание обязательно');
  } else {
    // При обновлении проверяем только переданные поля
    if (body.roomNumber !== undefined && body.roomNumber.toString().trim() === '')
      errors.push('Номер комнаты не может быть пустым');
    if (body.serviceType !== undefined && body.serviceType.toString().trim() === '')
      errors.push('Тип услуги не может быть пустым');
    if (body.description !== undefined && body.description.toString().trim() === '')
      errors.push('Описание не может быть пустым');
  }

  if (body.priority && !['Низкий', 'Средний', 'Высокий'].includes(body.priority))
    errors.push('Приоритет должен быть: Низкий, Средний или Высокий');

  return errors;
}

// API 
app.get('/api/orders', (req, res) => {
  let orders = readOrders();
  const { status, priority } = req.query;
  if (status) orders = orders.filter(o => o.status === status);
  if (priority) orders = orders.filter(o => o.priority === priority);
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const orders = readOrders();
  const newOrder = {
    id: uuidv4(),
    roomNumber: req.body.roomNumber.trim(),
    serviceType: req.body.serviceType.trim(),
    description: req.body.description.trim(),
    status: req.body.status || 'Новая',
    priority: req.body.priority || 'Средний',
    createdAt: new Date().toISOString()
  };

  orders.push(newOrder);
  writeOrders(orders);
  res.status(201).json(newOrder);
});

app.patch('/api/orders/:id', (req, res) => {
  const orders = readOrders();
  const index = orders.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }

  const allowed = ['status', 'priority', 'description', 'serviceType', 'roomNumber'];
  const updates = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Не передано ни одного поля для обновления' });
  }

  const errors = validateOrder({ ...orders[index], ...updates }, true);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  Object.assign(orders[index], updates);
  writeOrders(orders);
  res.json(orders[index]);
});

app.delete('/api/orders/:id', (req, res) => {
  const orders = readOrders();
  const index = orders.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  orders.splice(index, 1);
  writeOrders(orders);
  res.status(204).send();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  if (!fs.existsSync(DATA_FILE)) writeOrders([]);
});