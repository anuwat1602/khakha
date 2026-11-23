// API BASE URL - รองรับการเปิดผ่าน localhost:3000, Live Server (port 5500), หรือเปิดแบบ file://
const API_BASE = (window.location.protocol === 'file:' || (window.location.port !== '3000' && window.location.port !== '')) 
  ? 'http://localhost:3000' 
  : '';

// app.js - ระบบหน้าร้านและการสั่งอาหาร (Pastel Customer App)

// State
let allMenuItems = [];
let categories = [];
let activeCategory = 'all';
let cart = [];
let currentModalItem = null;
let currentModalQty = 1;
let currentRating = 5;

// Sound Effects via Web Audio API (Zero dependency)
function playCuteSound(type = 'pop') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {
    // AudioContext blocked or not supported
  }
}

// ---------------- INIT ----------------
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadMenuItems();
  loadReviews();
  loadCartFromStorage();
});

// ---------------- API CALLS ----------------

// 1. โหลดหมวดหมู่
async function loadCategories() {
  try {
    const res = await fetch(API_BASE + '/api/categories');
    const json = await res.json();
    if (json.success) {
      categories = json.data;
      renderCategoryTabs();
    }
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('categoryTabs');
  const existingButtons = `
    <button class="category-btn ${activeCategory === 'all' ? 'active' : ''}" data-category="all" onclick="selectCategory('all', this)">
      <span>✨</span> ทั้งหมด
    </button>
  `;

  const tabsHtml = categories.map(cat => `
    <button class="category-btn ${activeCategory === cat.slug ? 'active' : ''}" data-category="${cat.slug}" onclick="selectCategory('${cat.slug}', this)">
      <span>${cat.icon || '🍛'}</span> ${cat.name}
    </button>
  `).join('');

  container.innerHTML = existingButtons + tabsHtml;
}

// 2. โหลดเมนูอาหาร
async function loadMenuItems(category = 'all', search = '') {
  try {
    let url = '/api/menu';
    const params = [];
    if (category && category !== 'all') params.push(`category=${encodeURIComponent(category)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url);
    const json = await res.json();

    if (json.success) {
      allMenuItems = json.data;
      renderMenuGrid(allMenuItems);
      document.getElementById('menuCountBadge').textContent = `พร้อมเสิร์ฟ ${allMenuItems.length} รายการ`;
    }
  } catch (err) {
    console.error('Error loading menu:', err);
    document.getElementById('menuGrid').innerHTML = `
      <div class="col-span-full py-16 text-center text-rose-400">
        <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
        <p>ไม่สามารถโหลดเมนูอาหารได้ กรุณาลองใหม่อีกครั้ง</p>
      </div>
    `;
  }
}

// 3. แสดงผลเมนู
function renderMenuGrid(items) {
  const grid = document.getElementById('menuGrid');

  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center text-stone-400">
        <div class="text-5xl mb-3">🔍</div>
        <p class="text-base font-semibold text-stone-600">ไม่พบเมนูอาหารที่ค้นหา</p>
        <p class="text-xs text-stone-400 mt-1">ลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่อื่นดูนะคะ</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => {
    const isOutOfStock = item.in_stock === 0;
    return `
      <div class="menu-card group ${isOutOfStock ? 'opacity-60' : ''}">
        <div class="menu-card-img-wrapper">
          <img src="${item.image_url}" alt="${item.name}" class="menu-card-img" onerror="this.src='https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'">
          
          ${item.badge ? `<span class="badge-pastel badge-pink absolute top-3 left-3 shadow-md">${item.badge}</span>` : ''}
          ${isOutOfStock ? `<span class="badge-pastel bg-stone-800 text-white absolute top-3 right-3">หมดชั่วคราว</span>` : ''}
        </div>

        <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-medium text-rose-500">${item.category_name || ''}</span>
              <span class="text-xs text-stone-400">${item.category_icon || '🍲'}</span>
            </div>
            <h4 class="font-bold text-stone-800 text-base group-hover:text-rose-500 transition-colors">
              ${item.name}
            </h4>
            <p class="text-xs text-stone-500 line-clamp-2 mt-1 font-light leading-relaxed">
              ${item.description || ''}
            </p>
          </div>

          <div class="pt-2 border-t border-pink-50 flex items-center justify-between">
            <div>
              <span class="text-xs text-stone-400">เริ่มต้น</span>
              <div class="text-lg font-bold text-rose-600">฿${item.price}</div>
            </div>

            ${!isOutOfStock ? `
              <button onclick="openFoodModal(${item.id})" class="btn-pastel-primary py-2 px-4 text-xs font-semibold">
                <i class="fa-solid fa-plus"></i> สั่งเลย
              </button>
            ` : `
              <span class="text-xs text-stone-400 italic">ขออภัย หมดแล้ว</span>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------------- CATEGORY & SEARCH ----------------
function selectCategory(slug, btn) {
  activeCategory = slug;
  document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  playCuteSound('pop');
  loadMenuItems(slug, document.getElementById('searchInput').value.trim());
}

function performSearch() {
  const q = document.getElementById('searchInput').value.trim();
  playCuteSound('pop');
  loadMenuItems(activeCategory, q);
}

document.getElementById('searchInput')?.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') performSearch();
});

// ---------------- FOOD CUSTOMIZATION MODAL ----------------
function openFoodModal(itemId) {
  const item = allMenuItems.find(i => i.id === itemId);
  if (!item) return;

  currentModalItem = item;
  currentModalQty = 1;

  document.getElementById('modalItemId').value = item.id;
  document.getElementById('modalItemName').textContent = item.name;
  document.getElementById('modalItemDesc').textContent = item.description || '';
  document.getElementById('modalItemImg').src = item.image_url;
  document.getElementById('modalItemBasePrice').textContent = `฿${item.price}`;
  document.getElementById('modalQtyDisplay').textContent = 1;
  document.getElementById('modalSpecialNotes').value = '';

  // Badge
  const badgeEl = document.getElementById('modalItemBadge');
  if (item.badge) {
    badgeEl.innerHTML = `<span class="badge-pastel badge-pink text-[11px]">${item.badge}</span>`;
  } else {
    badgeEl.innerHTML = '';
  }

  // Size Options
  const sizeSection = document.getElementById('sizeOptionSection');
  const specialLabel = document.getElementById('specialSizeLabel');
  document.querySelector('input[name="opt_size"][value="normal"]').checked = true;
  document.getElementById('modalSizeNormalPrice').textContent = `฿${item.price}`;

  if (item.price_special) {
    specialLabel.classList.remove('hidden');
    document.getElementById('modalSizeSpecialPrice').textContent = `฿${item.price_special}`;
  } else {
    specialLabel.classList.add('hidden');
  }

  // Pork Preference (เฉพาะหมวดข้าวขาหมู)
  const porkPrefSection = document.getElementById('porkPrefSection');
  if (item.category_slug === 'rice' || item.category_slug === 'dish') {
    porkPrefSection.classList.remove('hidden');
  } else {
    porkPrefSection.classList.add('hidden');
  }

  // Reset checkboxes
  document.querySelectorAll('input[name="opt_extra"]').forEach(cb => cb.checked = false);

  updateModalCalculatedPrice();

  document.getElementById('foodModal').classList.remove('hidden');
  playCuteSound('pop');
}

function closeFoodModal() {
  document.getElementById('foodModal').classList.add('hidden');
  currentModalItem = null;
}

function adjustModalQty(delta) {
  currentModalQty = Math.max(1, currentModalQty + delta);
  document.getElementById('modalQtyDisplay').textContent = currentModalQty;
  updateModalCalculatedPrice();
  playCuteSound('pop');
}

function updateModalCalculatedPrice() {
  if (!currentModalItem) return;

  const size = document.querySelector('input[name="opt_size"]:checked')?.value || 'normal';
  let basePrice = size === 'special' && currentModalItem.price_special ? currentModalItem.price_special : currentModalItem.price;

  let extraTotal = 0;
  document.querySelectorAll('input[name="opt_extra"]:checked').forEach(cb => {
    extraTotal += Number(cb.dataset.price || 0);
  });

  const unitPrice = basePrice + extraTotal;
  const grandTotal = unitPrice * currentModalQty;

  document.getElementById('modalTotalPriceDisplay').textContent = `• ฿${grandTotal}`;
}

// ---------------- CART SYSTEM ----------------
function confirmAddToCart(e) {
  e.preventDefault();
  if (!currentModalItem) return;

  const size = document.querySelector('input[name="opt_size"]:checked')?.value || 'normal';
  const sizePrice = (size === 'special' && currentModalItem.price_special) ? currentModalItem.price_special : currentModalItem.price;

  let extraToppings = [];
  let extraCost = 0;
  document.querySelectorAll('input[name="opt_extra"]:checked').forEach(cb => {
    extraToppings.push(cb.value);
    extraCost += Number(cb.dataset.price || 0);
  });

  const porkPref = document.querySelector('input[name="opt_pork"]:checked')?.value || null;
  const notes = document.getElementById('modalSpecialNotes').value.trim();

  const unitPrice = sizePrice + extraCost;

  const cartItem = {
    cart_id: Date.now() + Math.random().toString(36).substr(2, 4),
    menu_item_id: currentModalItem.id,
    item_name: currentModalItem.name,
    option_size: size,
    pork_preference: (currentModalItem.category_slug === 'rice' || currentModalItem.category_slug === 'dish') ? porkPref : null,
    extra_toppings: extraToppings,
    notes: notes,
    unit_price: unitPrice,
    quantity: currentModalQty,
    image_url: currentModalItem.image_url
  };

  cart.push(cartItem);
  saveCartToStorage();
  updateCartUI();
  closeFoodModal();
  playCuteSound('success');
}

function updateCartUI() {
  const totalCount = cart.reduce((sum, it) => sum + it.quantity, 0);
  const totalAmount = cart.reduce((sum, it) => sum + (it.unit_price * it.quantity), 0);

  // Header count badge
  const headerBadge = document.getElementById('headerCartCount');
  if (totalCount > 0) {
    headerBadge.textContent = totalCount;
    headerBadge.classList.remove('hidden');
  } else {
    headerBadge.classList.add('hidden');
  }

  // Floating button
  const floatingBtn = document.getElementById('floatingCart');
  const floatingBadge = document.getElementById('floatingCartBadge');
  const floatingTotal = document.getElementById('floatingCartTotal');

  if (totalCount > 0) {
    floatingBtn.classList.remove('hidden');
    floatingBadge.textContent = totalCount;
    floatingTotal.textContent = `฿${totalAmount}`;
  } else {
    floatingBtn.classList.add('hidden');
  }

  // Render items inside drawer if open
  renderCartDrawerItems(totalAmount);
}

function renderCartDrawerItems(totalAmount) {
  const container = document.getElementById('cartItemsContainer');
  const totalDisplay = document.getElementById('cartDrawerTotalPrice');
  if (totalDisplay) totalDisplay.textContent = `฿${totalAmount}`;

  if (!cart || cart.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-stone-400">
        <div class="text-5xl mb-3">🧺</div>
        <p class="font-semibold text-stone-600">ยังไม่มีรายการในตะกร้า</p>
        <p class="text-xs text-stone-400 mt-1">เลือกเมนูข้าวขาหมูสุดละมุนได้เลยนะคะ</p>
      </div>
    `;
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="bg-white p-3.5 rounded-2xl border border-pink-100 shadow-sm flex items-start justify-between gap-3">
      <div class="flex-1">
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-stone-800 text-sm">${item.item_name}</span>
          ${item.option_size === 'special' ? '<span class="badge-pastel badge-pink text-[10px]">พิเศษ</span>' : ''}
        </div>

        <div class="text-[11px] text-stone-500 mt-0.5 space-y-0.5">
          ${item.pork_preference ? `<div>หมู: <span class="text-rose-500 font-medium">${item.pork_preference}</span></div>` : ''}
          ${item.extra_toppings && item.extra_toppings.length ? `<div>เพิ่ม: ${item.extra_toppings.join(', ')}</div>` : ''}
          ${item.notes ? `<div class="text-amber-600 italic">" ${item.notes} "</div>` : ''}
        </div>

        <div class="text-rose-600 font-bold text-xs mt-2">฿${item.unit_price * item.quantity}</div>
      </div>

      <div class="flex flex-col items-end gap-2">
        <button onclick="removeCartItem('${item.cart_id}')" class="text-stone-300 hover:text-rose-500 text-xs transition">
          <i class="fa-solid fa-trash-can"></i>
        </button>

        <div class="flex items-center border border-pink-200 rounded-full bg-pink-50/50 px-2 py-0.5 text-xs">
          <button onclick="changeCartQty('${item.cart_id}', -1)" class="text-rose-600 font-bold px-1.5">-</button>
          <span class="w-5 text-center font-bold text-stone-800">${item.quantity}</span>
          <button onclick="changeCartQty('${item.cart_id}', 1)" class="text-rose-600 font-bold px-1.5">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

function changeCartQty(cartId, delta) {
  const item = cart.find(i => i.cart_id === cartId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.cart_id !== cartId);
  }
  saveCartToStorage();
  updateCartUI();
  playCuteSound('pop');
}

function removeCartItem(cartId) {
  cart = cart.filter(i => i.cart_id !== cartId);
  saveCartToStorage();
  updateCartUI();
  playCuteSound('pop');
}

function openCartDrawer() {
  document.getElementById('cartDrawer').classList.remove('hidden');
  updateCartUI();
}

function closeCartDrawer() {
  document.getElementById('cartDrawer').classList.add('hidden');
}

function toggleOrderTypeInputs() {
  const type = document.querySelector('input[name="order_type"]:checked').value;
  const tableGroup = document.getElementById('tableInputGroup');
  const addressGroup = document.getElementById('addressInputGroup');

  if (type === 'dine-in') {
    tableGroup.classList.remove('hidden');
    addressGroup.classList.add('hidden');
  } else if (type === 'delivery') {
    tableGroup.classList.add('hidden');
    addressGroup.classList.remove('hidden');
  } else {
    tableGroup.classList.add('hidden');
    addressGroup.classList.add('hidden');
  }
}

// ---------------- SUBMIT ORDER ----------------
async function submitOrder() {
  if (cart.length === 0) {
    alert('กรุณาเลือกรายการอาหารก่อนทำการสั่งซื้อนะคะ 🌸');
    return;
  }

  const orderType = document.querySelector('input[name="order_type"]:checked').value;
  const customerName = document.getElementById('orderCustomerName').value.trim();
  const customerPhone = document.getElementById('orderCustomerPhone').value.trim();
  const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

  if (!customerName) {
    alert('กรุณากรอกชื่อลูกค้าด้วยนะคะ ✨');
    document.getElementById('orderCustomerName').focus();
    return;
  }

  let tableNumber = null;
  let deliveryAddress = null;

  if (orderType === 'dine-in') {
    tableNumber = document.getElementById('orderTableNo').value.trim();
    if (!tableNumber) {
      alert('กรุณาระบุหมายเลขโต๊ะด้วยนะคะ 🍽️');
      document.getElementById('orderTableNo').focus();
      return;
    }
  } else if (orderType === 'delivery') {
    deliveryAddress = document.getElementById('orderAddress').value.trim();
    if (!deliveryAddress) {
      alert('กรุณาระบุที่อยู่สำหรับจัดส่งด้วยนะคะ 🛵');
      document.getElementById('orderAddress').focus();
      return;
    }
  }

  const payload = {
    order_type: orderType,
    table_number: tableNumber,
    customer_name: customerName,
    customer_phone: customerPhone,
    delivery_address: deliveryAddress,
    payment_method: paymentMethod,
    items: cart
  };

  const btn = document.getElementById('btnSubmitOrder');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่งออเดอร์...';

  try {
    const res = await fetch(API_BASE + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      // Clear Cart
      cart = [];
      saveCartToStorage();
      updateCartUI();
      closeCartDrawer();

      // Show Success Modal
      document.getElementById('successOrderNumber').textContent = result.order_number;
      document.getElementById('successCustomerName').textContent = customerName;
      document.getElementById('successTotalAmount').textContent = `฿${result.total_amount}`;

      // PromptPay QR visibility
      const qrSection = document.getElementById('promptpaySection');
      if (paymentMethod === 'promptpay') {
        qrSection.classList.remove('hidden');
      } else {
        qrSection.classList.add('hidden');
      }

      document.getElementById('orderSuccessModal').classList.remove('hidden');
      playCuteSound('success');
    } else {
      alert(result.error || 'เกิดข้อผิดพลาดในการสั่งอาหาร');
    }
  } catch (err) {
    console.error('Error submitting order:', err);
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>ยืนยันการสั่งอาหาร ✨</span>';
  }
}

function closeSuccessModal() {
  document.getElementById('orderSuccessModal').classList.add('hidden');
}

function trackThisOrder() {
  const orderNum = document.getElementById('successOrderNumber').textContent;
  closeSuccessModal();
  openTrackerModal();
  document.getElementById('trackerInput').value = orderNum;
  searchOrderStatus();
}

// ---------------- ORDER TRACKER ----------------
function openTrackerModal() {
  document.getElementById('trackerModal').classList.remove('hidden');
}

function closeTrackerModal() {
  document.getElementById('trackerModal').classList.add('hidden');
}

async function searchOrderStatus() {
  const query = document.getElementById('trackerInput').value.trim();
  if (!query) return;

  const resultContainer = document.getElementById('trackerResult');
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = '<div class="py-8 text-center text-rose-400"><i class="fa-solid fa-spinner fa-spin text-2xl"></i> กำลังตรวจสอบ...</div>';

  try {
    const res = await fetch(API_BASE + `/api/orders/${encodeURIComponent(query)}`);
    const json = await res.json();

    if (!json.success || !json.data) {
      resultContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-rose-50 text-rose-700 text-center text-xs">
          <i class="fa-solid fa-circle-question text-lg mb-1"></i>
          <p>ไม่พบคำสั่งซื้อหมายเลข <b>${query}</b> ค่ะ</p>
        </div>
      `;
      return;
    }

    const order = json.data;
    const statusMap = {
      'pending': { text: 'รอเริ่มปรุง 📝', step: 1, desc: 'ครัวได้รับออเดอร์แล้ว รอเข้าคิวสับขาหมู' },
      'cooking': { text: 'กำลังปรุง 🥘', step: 2, desc: 'เชฟกำลังตักข้าว หั่นเนื้อขาหมูนุ่มๆ และราดน้ำพะโล้ร้อนๆ' },
      'ready': { text: 'พร้อมเสิร์ฟ / กำลังจัดส่ง 🛵', step: 3, desc: 'อาหารเสร็จเรียบร้อย พร้อมเสิร์ฟถึงโต๊ะหรือส่งถึงมือคุณ' },
      'completed': { text: 'อิ่มอร่อยเรียบร้อย ✨', step: 4, desc: 'เสร็จสิ้นคำสั่งซื้อ ขอให้อร่อยกับมื้อนี้นะคะ' },
      'cancelled': { text: 'ยกเลิกออเดอร์ ❌', step: 0, desc: 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว' }
    };

    const currentStatus = statusMap[order.status] || { text: order.status, step: 1, desc: '' };

    resultContainer.innerHTML = `
      <div class="bg-white p-4 rounded-2xl border border-pink-100 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-pink-50 pb-3">
          <div>
            <div class="text-xs text-stone-400">เลขที่คำสั่งซื้อ</div>
            <div class="font-bold text-rose-600 text-sm">${order.order_number}</div>
          </div>
          <span class="badge-pastel badge-pink font-bold">${currentStatus.text}</span>
        </div>

        <!-- Timeline Steps -->
        <div class="relative py-2">
          <div class="flex items-center justify-between text-xs font-semibold text-stone-600">
            <span class="${currentStatus.step >= 1 ? 'text-rose-500 font-bold' : 'opacity-40'}">1. ได้รับ</span>
            <span class="${currentStatus.step >= 2 ? 'text-rose-500 font-bold' : 'opacity-40'}">2. กำลังปรุง</span>
            <span class="${currentStatus.step >= 3 ? 'text-rose-500 font-bold' : 'opacity-40'}">3. พร้อมเสิร์ฟ</span>
            <span class="${currentStatus.step >= 4 ? 'text-rose-500 font-bold' : 'opacity-40'}">4. อิ่มอร่อย</span>
          </div>
          <div class="w-full bg-pink-100 h-2 rounded-full mt-2 overflow-hidden">
            <div class="bg-gradient-to-r from-rose-400 to-pink-500 h-full rounded-full transition-all duration-500" style="width: ${Math.min(100, currentStatus.step * 25)}%"></div>
          </div>
          <p class="text-xs text-stone-500 text-center mt-2 font-cute">${currentStatus.desc}</p>
        </div>

        <!-- Items Breakdown -->
        <div class="border-t border-pink-50 pt-3 text-xs space-y-1.5">
          <div class="font-bold text-stone-700">รายการอาหาร (${order.items.length} รายการ):</div>
          ${order.items.map(it => `
            <div class="flex justify-between text-stone-600">
              <span>${it.item_name} x${it.quantity} ${it.option_size === 'special' ? '(พิเศษ)' : ''}</span>
              <span class="font-semibold">฿${it.subtotal}</span>
            </div>
          `).join('')}
          <div class="border-t border-dashed border-stone-200 pt-2 flex justify-between font-bold text-stone-800 text-sm">
            <span>ยอดชำระ:</span>
            <span class="text-rose-600">฿${order.total_amount}</span>
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    resultContainer.innerHTML = '<p class="text-xs text-rose-500 text-center">เกิดข้อผิดพลาดในการค้นหา</p>';
  }
}

// ---------------- REVIEWS ----------------
async function loadReviews() {
  try {
    const res = await fetch(API_BASE + '/api/reviews');
    const json = await res.json();
    if (json.success && json.data.length > 0) {
      const container = document.getElementById('reviewsList');
      container.innerHTML = json.data.slice(0, 3).map(rev => `
        <div class="bg-white p-5 rounded-2xl border border-pink-100 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <div class="flex text-amber-400 text-xs gap-1 mb-2">
              ${Array(rev.rating).fill('<i class="fa-solid fa-star"></i>').join('')}
            </div>
            <p class="text-xs text-stone-600 leading-relaxed font-light">
              "${rev.comment}"
            </p>
          </div>
          <div class="text-xs font-semibold text-rose-600 font-cute">
            — ${rev.customer_name}
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading reviews:', err);
  }
}

function openReviewModal() {
  document.getElementById('reviewModal').classList.remove('hidden');
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.add('hidden');
}

function setStarRating(num) {
  currentRating = num;
  document.getElementById('reviewRating').value = num;
  const stars = document.querySelectorAll('#starRatingGroup i');
  stars.forEach((s, idx) => {
    if (idx < num) {
      s.classList.add('text-amber-400');
      s.classList.remove('text-stone-300');
    } else {
      s.classList.remove('text-amber-400');
      s.classList.add('text-stone-300');
    }
  });
}

async function submitReview(e) {
  e.preventDefault();
  const name = document.getElementById('reviewName').value.trim();
  const comment = document.getElementById('reviewComment').value.trim();
  const rating = Number(document.getElementById('reviewRating').value || 5);

  try {
    const res = await fetch(API_BASE + '/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: name, comment, rating })
    });
    const json = await res.json();
    if (json.success) {
      alert('ขอบคุณสำหรับรีวิวแสนอบอุ่นนะคะ 🌸');
      closeReviewModal();
      loadReviews();
      playCuteSound('success');
    }
  } catch (err) {
    alert('ไม่สามารถส่งรีวิวได้ในขณะนี้');
  }
}

// ---------------- LOCAL STORAGE CACHE ----------------
function saveCartToStorage() {
  try {
    localStorage.setItem('khamoo_cart', JSON.stringify(cart));
  } catch (e) {}
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem('khamoo_cart');
    if (raw) {
      cart = JSON.parse(raw);
      updateCartUI();
    }
  } catch (e) {}
}
