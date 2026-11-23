// API BASE URL - รองรับการเปิดผ่าน localhost:3000, Live Server (port 5500), หรือเปิดแบบ file://
const API_BASE = (window.location.protocol === 'file:' || (window.location.port !== '3000' && window.location.port !== '')) 
  ? 'http://localhost:3000' 
  : '';

// admin.js - สคริปต์จัดการครัวและระบบหลังร้าน POS (รองรับ Staff Authentication)
let currentTab = 'orders';
let orders = [];
let menuList = [];
let categories = [];
let soundAlertEnabled = true;
let previousOrderCount = 0;
let currentStaff = null;

// Helper: ดึง Auth Token จาก LocalStorage
function getAuthToken() {
  return localStorage.getItem('khamoo_staff_token') || '';
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('khamoo_staff_token', token);
  } else {
    localStorage.removeItem('khamoo_staff_token');
  }
}

// Helper: Custom fetch ที่แนบ Authorization Header
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`
  };

  const response = await fetch(url, { ...options, headers });

  // หาก Token หมดอายุหรือไม่ถูกต้อง ให้บังคับออกจากระบบ
  if (response.status === 401) {
    setAuthToken(null);
    showLoginScreen();
    throw new Error('Unauthorized');
  }

  return response;
}

// Web Audio Beep Alert
function playKitchenAlert(type = 'new-order') {
  if (!soundAlertEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'new-order') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {}
}

// ---------------- INIT & AUTH CHECK ----------------
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  checkServerStatus();
  setInterval(checkServerStatus, 5000);

  // Auto refresh every 10 seconds เมื่อล็อกอินแล้ว
  setInterval(() => {
    if (currentStaff && currentTab === 'orders') {
      fetchOrders(true);
      fetchStats();
    }
  }, 10000);
});

async function checkAuth() {
  const token = getAuthToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await res.json();

    if (json.success && json.user) {
      currentStaff = json.user;
      showAdminApp();
      loadInitialData();
    } else {
      setAuthToken(null);
      showLoginScreen();
    }
  } catch (err) {
    showLoginScreen();
  }
}

function showLoginScreen() {
  currentStaff = null;
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').classList.add('hidden');
}

function showAdminApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');

  // แสดงข้อมูลพนักงานใน Header
  if (currentStaff) {
    document.getElementById('staffDisplayName').textContent = currentStaff.full_name;

    const roleMap = {
      'manager': { label: 'ผู้จัดการร้าน 👑', avatar: '👑' },
      'cashier': { label: 'พนักงานแคชเชียร์ 🎀', avatar: '🎀' },
      'chef': { label: 'หัวหน้าพ่อครัว 👨‍🍳', avatar: '👨‍🍳' }
    };

    const roleInfo = roleMap[currentStaff.role] || { label: currentStaff.role, avatar: '🌸' };
    document.getElementById('staffDisplayRole').textContent = roleInfo.label;
    document.getElementById('staffAvatar').textContent = roleInfo.avatar;
  }
}

// ---------------- LOGIN / LOGOUT ----------------
async function handleStaffLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errorAlert = document.getElementById('loginErrorAlert');
  const errorMsg = document.getElementById('loginErrorMsg');
  const submitBtn = document.getElementById('btnLoginSubmit');

  errorAlert.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบสิทธิ์...';

  try {
    const res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();

    if (json.success && json.token) {
      setAuthToken(json.token);
      currentStaff = json.user;
      showAdminApp();
      loadInitialData();
    } else {
      errorMsg.textContent = json.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      errorAlert.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Login Error:', err);
    if (window.location.protocol === 'file:') {
      errorMsg.innerHTML = '⚠️ <b>ตรวจพบการเปิดไฟล์แบบ file://</b><br>เบราว์เซอร์ไม่อนุญาตให้เชื่อมต่อ API จากไฟล์ตรงๆ<br>👉 <b>วิธีแก้:</b> กรุณารันไฟล์ <b>start.bat</b> ในไดร์ฟ <code>D:\\khamoo</code> แล้วเปิดที่ <a href="http://localhost:3000/admin.html" target="_blank" class="underline font-bold text-rose-700">http://localhost:3000/admin.html</a>';
    } else {
      errorMsg.innerHTML = '⚠️ <b>ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ Node.js ได้</b><br>👉 <b>วิธีแก้:</b> กรุณาเปิดรันไฟล์ <b>start.bat</b> หรือรันคำสั่ง <code>node server.js</code> ในโฟลเดอร์ <code>D:\\khamoo</code> (และห้ามปิดหน้าต่างสีดำขณะใช้งาน)';
    }
    errorAlert.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> เข้าสู่ระบบพนักงาน';
  }
}

async function handleStaffLogout() {
  if (!confirm('คุณต้องการออกจากระบบพนักงานใช่หรือไม่? 🚪')) return;

  try {
    await authFetch(API_BASE + '/api/auth/logout', { method: 'POST' });
  } catch (e) {}

  setAuthToken(null);
  currentStaff = null;
  showLoginScreen();
}

function fillTestAccount(user, pwd) {
  document.getElementById('loginUsername').value = user;
  document.getElementById('loginPassword').value = pwd;
}

function togglePasswordVisibility() {
  const pwdInput = document.getElementById('loginPassword');
  const icon = document.getElementById('eyeIcon');
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    pwdInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// ---------------- LOAD DATA ----------------
function loadInitialData() {
  fetchCategories();
  fetchOrders();
  fetchStats();
  fetchMenu();
  fetchReviews();
}

// Tab Switcher
function switchTab(tab) {
  currentTab = tab;
  ['orders', 'menu', 'reviews'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.add('hidden');
    document.getElementById(`tabBtn-${t}`).classList.remove('active');
  });

  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.getElementById(`tabBtn-${tab}`).classList.add('active');

  if (tab === 'menu') fetchMenu();
  if (tab === 'reviews') fetchReviews();
}

function toggleSoundAlert() {
  soundAlertEnabled = !soundAlertEnabled;
  document.getElementById('soundAlertText').textContent = `เสียงแจ้งเตือน: ${soundAlertEnabled ? 'เปิด' : 'ปิด'}`;
  if (soundAlertEnabled) playKitchenAlert();
}

// ---------------- ORDERS POS ----------------
async function fetchOrders(isBackground = false) {
  try {
    const status = document.getElementById('orderStatusFilter').value;
    let url = '/api/orders';
    if (status && status !== 'all') url += `?status=${status}`;

    const res = await authFetch(url);
    const json = await res.json();

    if (json.success) {
      if (isBackground && json.data.length > previousOrderCount) {
        playKitchenAlert('new-order');
      }
      previousOrderCount = json.data.length;

      orders = json.data;
      renderOrdersGrid(orders);
      document.getElementById('ordersListCount').textContent = orders.length;
    }
  } catch (err) {
    console.error('Error fetching orders:', err);
  }
}

function renderOrdersGrid(list) {
  const container = document.getElementById('ordersGrid');

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center text-stone-400 bg-white rounded-2xl border border-pink-100">
        <div class="text-4xl mb-2">🍽️</div>
        <p class="font-semibold text-stone-600">ไม่มีรายการคำสั่งซื้อในสถานะนี้</p>
      </div>
    `;
    return;
  }

  const statusBadges = {
    'pending': '<span class="badge-pastel badge-butter font-bold">รอเริ่มปรุง 📝</span>',
    'cooking': '<span class="badge-pastel badge-pink font-bold">กำลังปรุง 🍳</span>',
    'ready': '<span class="badge-pastel badge-mint font-bold">พร้อมเสิร์ฟ 🛵</span>',
    'completed': '<span class="badge-pastel badge-lavender">เสร็จสิ้น ✅</span>',
    'cancelled': '<span class="badge-pastel bg-stone-200 text-stone-600">ยกเลิก ❌</span>'
  };

  const typeLabels = {
    'dine-in': '🍽️ ทานที่ร้าน',
    'takeaway': '🥡 สั่งกลับบ้าน',
    'delivery': '🛵 เดลิเวอรี่'
  };

  container.innerHTML = list.map(order => `
    <div class="bg-white rounded-2xl border border-pink-100 shadow-sm p-4 flex flex-col justify-between space-y-3 ${order.status === 'cooking' ? 'ring-2 ring-rose-300' : ''}">
      
      <!-- Order Header -->
      <div class="flex items-start justify-between border-b border-pink-50 pb-2.5">
        <div>
          <span class="text-[10px] text-stone-400">${new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
          <h4 class="font-extrabold text-rose-600 text-sm tracking-wide">${order.order_number}</h4>
          <div class="text-xs font-semibold text-stone-700 mt-0.5">
            ${typeLabels[order.order_type] || order.order_type}
            ${order.table_number ? `<span class="text-rose-500 font-bold ml-1">(${order.table_number})</span>` : ''}
          </div>
        </div>
        <div class="text-right">
          ${statusBadges[order.status] || order.status}
          <div class="text-[11px] text-stone-400 mt-1">ชำระ: ${order.payment_method === 'promptpay' ? 'พร้อมเพย์' : 'เงินสด'}</div>
        </div>
      </div>

      <!-- Customer Info -->
      <div class="text-xs bg-pink-50/40 p-2.5 rounded-xl border border-pink-50 space-y-0.5">
        <div><span class="text-stone-400">ลูกค้า:</span> <b>${order.customer_name}</b> ${order.customer_phone ? `(${order.customer_phone})` : ''}</div>
        ${order.delivery_address ? `<div class="text-[11px] text-stone-500"><i class="fa-solid fa-location-dot text-rose-400"></i> ${order.delivery_address}</div>` : ''}
      </div>

      <!-- Items List -->
      <div class="space-y-2 text-xs flex-1">
        ${order.items.map(it => `
          <div class="border-b border-dashed border-stone-100 pb-1.5">
            <div class="flex justify-between font-bold text-stone-800">
              <span>${it.quantity}x ${it.item_name} ${it.option_size === 'special' ? '<span class="text-rose-500 text-[10px]">(พิเศษ)</span>' : ''}</span>
              <span>฿${it.subtotal}</span>
            </div>
            ${it.pork_preference ? `<div class="text-[11px] text-stone-500">หมู: ${it.pork_preference}</div>` : ''}
            ${it.extra_toppings ? `<div class="text-[11px] text-stone-500">เพิ่ม: ${it.extra_toppings}</div>` : ''}
            ${it.notes ? `<div class="text-[11px] text-amber-600 italic">" ${it.notes} "</div>` : ''}
          </div>
        `).join('')}
      </div>

      <!-- Total Price -->
      <div class="border-t border-pink-50 pt-2 flex items-center justify-between font-bold text-stone-800 text-sm">
        <span>ยอดรวม:</span>
        <span class="text-rose-600 text-base">฿${order.total_amount}</span>
      </div>

      <!-- Action Buttons -->
      <div class="grid grid-cols-2 gap-2 pt-1 text-xs">
        ${order.status === 'pending' ? `
          <button onclick="updateOrderStatus(${order.id}, 'cooking')" class="col-span-2 btn-pastel-primary py-2 font-bold">
            🍳 เริ่มทำอาหาร
          </button>
        ` : ''}

        ${order.status === 'cooking' ? `
          <button onclick="updateOrderStatus(${order.id}, 'ready')" class="col-span-2 btn-pastel-mint py-2 font-bold">
            🛵 พร้อมเสิร์ฟ / จัดส่ง
          </button>
        ` : ''}

        ${order.status === 'ready' ? `
          <button onclick="updateOrderStatus(${order.id}, 'completed', 'paid')" class="col-span-2 bg-purple-500 text-white rounded-full py-2 font-bold hover:bg-purple-600 transition shadow">
            ✅ เช็คบิล / ปิดออเดอร์
          </button>
        ` : ''}

        ${order.status !== 'completed' && order.status !== 'cancelled' ? `
          <button onclick="updateOrderStatus(${order.id}, 'cancelled')" class="btn-pastel-secondary py-1 text-stone-400 hover:text-rose-500">
            ❌ ยกเลิก
          </button>
        ` : ''}

        <button onclick="printOrderReceipt(${order.id})" class="btn-pastel-secondary py-1 ${order.status === 'completed' || order.status === 'cancelled' ? 'col-span-2' : ''}">
          <i class="fa-solid fa-print"></i> พิมพ์ใบสั่ง
        </button>
      </div>

    </div>
  `).join('');
}

async function updateOrderStatus(orderId, newStatus, paymentStatus = null) {
  try {
    const payload = { status: newStatus };
    if (paymentStatus) payload.payment_status = paymentStatus;

    const res = await authFetch(API_BASE + `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      fetchOrders();
      fetchStats();
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
  }
}

// ---------------- STATS ----------------
async function fetchStats() {
  try {
    const res = await authFetch(API_BASE + '/api/stats');
    const json = await res.json();
    if (json.success) {
      const data = json.data;
      document.getElementById('statRevenue').textContent = `฿${data.totalRevenue.toLocaleString()}`;
      document.getElementById('statTotalOrders').textContent = data.totalOrders;
      document.getElementById('statPendingOrders').textContent = data.pendingOrders;
      document.getElementById('statCompletedOrders').textContent = data.completedOrders;
    }
  } catch (err) {}
}

// ---------------- MENU MANAGEMENT ----------------
async function fetchCategories() {
  try {
    const res = await fetch(API_BASE + '/api/categories');
    const json = await res.json();
    if (json.success) {
      categories = json.data;
      const select = document.getElementById('menuFormCategory');
      select.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    }
  } catch (err) {}
}

async function fetchMenu() {
  try {
    const res = await fetch(API_BASE + '/api/menu');
    const json = await res.json();
    if (json.success) {
      menuList = json.data;
      renderMenuTable(menuList);
    }
  } catch (err) {}
}

function renderMenuTable(items) {
  const tbody = document.getElementById('adminMenuTableBody');
  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-pink-50/30 transition">
      <td class="p-3.5 flex items-center gap-3">
        <img src="${item.image_url}" class="w-12 h-12 rounded-xl object-cover bg-pink-100" onerror="this.src='https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'">
        <div>
          <div class="font-bold text-stone-800 text-sm">${item.name}</div>
          ${item.badge ? `<span class="badge-pastel badge-pink text-[10px] mt-0.5">${item.badge}</span>` : ''}
        </div>
      </td>
      <td class="p-3.5 text-stone-600">${item.category_name}</td>
      <td class="p-3.5 font-bold text-stone-800">
        ฿${item.price} ${item.price_special ? `<span class="text-rose-500 font-normal">/ ฿${item.price_special}</span>` : ''}
      </td>
      <td class="p-3.5">
        <button onclick="toggleInStock(${item.id}, ${item.in_stock ? 0 : 1})" class="badge-pastel ${item.in_stock ? 'badge-mint' : 'bg-stone-200 text-stone-600'} cursor-pointer">
          ${item.in_stock ? '● มีขาย' : '○ ของหมด'}
        </button>
      </td>
      <td class="p-3.5 text-right space-x-2">
        <button onclick="editMenuItem(${item.id})" class="text-stone-400 hover:text-rose-500 text-sm">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button onclick="deleteMenuItem(${item.id})" class="text-stone-400 hover:text-rose-500 text-sm">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

async function toggleInStock(id, newStatus) {
  try {
    await authFetch(API_BASE + `/api/menu/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ in_stock: newStatus })
    });
    fetchMenu();
  } catch (err) {}
}

function openAddMenuModal() {
  document.getElementById('editMenuId').value = '';
  document.getElementById('menuModalTitle').textContent = 'เพิ่มเมนูอาหารใหม่ 🍲';
  document.getElementById('menuFormName').value = '';
  document.getElementById('menuFormPrice').value = '';
  document.getElementById('menuFormPriceSpecial').value = '';
  document.getElementById('menuFormDesc').value = '';
  document.getElementById('menuFormImage').value = '';
  document.getElementById('menuFormBadge').value = '';
  document.getElementById('menuFormInStock').checked = true;
  document.getElementById('menuFormPopular').checked = false;
  document.getElementById('menuItemModal').classList.remove('hidden');
}

function editMenuItem(id) {
  const item = menuList.find(i => i.id === id);
  if (!item) return;

  document.getElementById('editMenuId').value = item.id;
  document.getElementById('menuModalTitle').textContent = 'แก้ไขเมนูอาหาร 🌸';
  document.getElementById('menuFormName').value = item.name;
  document.getElementById('menuFormCategory').value = item.category_id;
  document.getElementById('menuFormPrice').value = item.price;
  document.getElementById('menuFormPriceSpecial').value = item.price_special || '';
  document.getElementById('menuFormDesc').value = item.description || '';
  document.getElementById('menuFormImage').value = item.image_url || '';
  document.getElementById('menuFormBadge').value = item.badge || '';
  document.getElementById('menuFormInStock').checked = item.in_stock === 1;
  document.getElementById('menuFormPopular').checked = item.is_popular === 1;

  document.getElementById('menuItemModal').classList.remove('hidden');
}

function closeMenuModal() {
  document.getElementById('menuItemModal').classList.add('hidden');
}

async function saveMenuItem(e) {
  e.preventDefault();
  const id = document.getElementById('editMenuId').value;
  const payload = {
    name: document.getElementById('menuFormName').value.trim(),
    category_id: Number(document.getElementById('menuFormCategory').value),
    price: Number(document.getElementById('menuFormPrice').value),
    price_special: document.getElementById('menuFormPriceSpecial').value ? Number(document.getElementById('menuFormPriceSpecial').value) : null,
    description: document.getElementById('menuFormDesc').value.trim(),
    image_url: document.getElementById('menuFormImage').value.trim(),
    badge: document.getElementById('menuFormBadge').value.trim(),
    in_stock: document.getElementById('menuFormInStock').checked ? 1 : 0,
    is_popular: document.getElementById('menuFormPopular').checked ? 1 : 0
  };

  try {
    const url = id ? `/api/menu/${id}` : '/api/menu';
    const method = id ? 'PUT' : 'POST';

    const res = await authFetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      closeMenuModal();
      fetchMenu();
    }
  } catch (err) {
    alert('ไม่สามารถบันทึกเมนูได้');
  }
}

async function deleteMenuItem(id) {
  if (!confirm('คุณต้องการลบเมนูนี้ใช่หรือไม่?')) return;
  try {
    const res = await authFetch(API_BASE + `/api/menu/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) fetchMenu();
  } catch (err) {}
}

// ---------------- REVIEWS ----------------
async function fetchReviews() {
  try {
    const res = await fetch(API_BASE + '/api/reviews');
    const json = await res.json();
    if (json.success) {
      const container = document.getElementById('adminReviewsContainer');
      container.innerHTML = json.data.map(r => `
        <div class="bg-white p-4 rounded-2xl border border-pink-100 shadow-sm space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-stone-800 text-sm font-cute">${r.customer_name}</span>
            <div class="text-amber-400 text-xs">
              ${Array(r.rating).fill('<i class="fa-solid fa-star"></i>').join('')}
            </div>
          </div>
          <p class="text-xs text-stone-600 font-light">"${r.comment}"</p>
          <div class="text-[10px] text-stone-400">${new Date(r.created_at).toLocaleString('th-TH')}</div>
        </div>
      `).join('');
    }
  } catch (err) {}
}

// ---------------- PRINT RECEIPT ----------------
function printOrderReceipt(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const printWindow = window.open('', '_blank', 'width=380,height=600');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ใบสั่งอาหาร ${order.order_number}</title>
      <style>
        body { font-family: 'Kanit', sans-serif; padding: 20px; font-size: 13px; color: #222; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .divider { border-bottom: 1px dashed #bbb; margin: 10px 0; }
        .item-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
      </style>
    </head>
    <body>
      <div class="text-center font-bold" style="font-size: 16px;">🌸 ร้านข้าวขาหมูหวานละมุน 🌸</div>
      <div class="text-center" style="font-size: 11px;">ใบสั่งอาหารห้องครัว</div>
      <div class="divider"></div>
      <div><b>เลขที่:</b> ${order.order_number}</div>
      <div><b>ประเภท:</b> ${order.order_type} ${order.table_number ? '(' + order.table_number + ')' : ''}</div>
      <div><b>ลูกค้า:</b> ${order.customer_name} ${order.customer_phone ? '(' + order.customer_phone + ')' : ''}</div>
      <div class="divider"></div>
      <div class="font-bold">รายการอาหาร:</div>
      ${order.items.map(it => `
        <div class="item-row">
          <span>${it.quantity}x ${it.item_name} ${it.option_size === 'special' ? '(พิเศษ)' : ''}</span>
          <span>฿${it.subtotal}</span>
        </div>
        ${it.pork_preference ? '<div style="font-size:11px;color:#666;">หมู: ' + it.pork_preference + '</div>' : ''}
        ${it.notes ? '<div style="font-size:11px;color:#c00;">โน้ต: ' + it.notes + '</div>' : ''}
      `).join('')}
      <div class="divider"></div>
      <div class="item-row font-bold" style="font-size: 14px;">
        <span>ยอดรวมทั้งสิ้น:</span>
        <span>฿${order.total_amount}</span>
      </div>
      <div class="divider"></div>
      <div class="text-center" style="font-size: 11px; color: #888;">ขอบคุณที่อุดหนุนค่ะ 💖</div>
      <script>
        window.onload = function() { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}


// ตรวจสอบสถานะการเชื่อมต่อเซิร์ฟเวอร์แบบ Real-time
async function checkServerStatus() {
  const badge = document.getElementById('serverStatusBadge');
  if (!badge) return;

  try {
    const res = await fetch(API_BASE + '/api/categories', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span> เซิร์ฟเวอร์ออนไลน์ (Online :3000)';
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (err) {
    badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> เซิร์ฟเวอร์ยังไม่เปิด (Offline - กรุณารัน start.bat)';
  }
}
