// server.js - Backend Web Server และ REST API สำหรับร้านข้าวขาหมูพาสเทล
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword } = require('./database');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper: JSON Response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token'
  });
  res.end(JSON.stringify(data));
}

// Helper: Read Request Body
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Helper: ตรวจสอบสิทธิ์พนักงาน (Staff Authentication)
function getAuthStaff(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) return null;

  try {
    const session = db.prepare(`
      SELECT s.token, u.id as staff_id, u.username, u.full_name, u.role, u.status
      FROM staff_sessions s
      JOIN staff u ON s.staff_id = u.id
      WHERE s.token = ? AND u.status = 'active'
    `).get(token);
    return session || null;
  } catch (e) {
    return null;
  }
}

// Create Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token'
    });
    res.end();
    return;
  }

  try {
    // ---------------- AUTHENTICATION APIS ----------------

    // 1. POST /api/auth/login (เข้าสู่ระบบพนักงาน)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await getRequestBody(req);
      const { username, password } = body;

      if (!username || !password) {
        return sendJson(res, 400, { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
      }

      const user = db.prepare("SELECT * FROM staff WHERE username = ? AND status = 'active'").get(username.trim());
      if (!user) {
        return sendJson(res, 401, { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      const inputHash = hashPassword(password);
      if (user.password_hash !== inputHash) {
        return sendJson(res, 401, { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      // สร้าง Session Token
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO staff_sessions (token, staff_id) VALUES (?, ?)').run(token, user.id);

      return sendJson(res, 200, {
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ',
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        }
      });
    }

    // 2. GET /api/auth/me (ตรวจสอบสถานะผู้ใช้งานปัจจุบัน)
    if (pathname === '/api/auth/me' && method === 'GET') {
      const staff = getAuthStaff(req);
      if (!staff) {
        return sendJson(res, 401, { success: false, error: 'ยังไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ' });
      }
      return sendJson(res, 200, {
        success: true,
        user: {
          id: staff.staff_id,
          username: staff.username,
          full_name: staff.full_name,
          role: staff.role
        }
      });
    }

    // 3. POST /api/auth/logout (ออกจากระบบ)
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
      if (authHeader) {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        if (token) {
          db.prepare('DELETE FROM staff_sessions WHERE token = ?').run(token);
        }
      }
      return sendJson(res, 200, { success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
    }

    // ---------------- PUBLIC CUSTOMER APIS ----------------

    // 4. GET /api/categories
    if (pathname === '/api/categories' && method === 'GET') {
      const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
      return sendJson(res, 200, { success: true, data: categories });
    }

    // 5. GET /api/menu
    if (pathname === '/api/menu' && method === 'GET') {
      const categorySlug = parsedUrl.searchParams.get('category');
      const search = parsedUrl.searchParams.get('search');

      let sql = `
        SELECT m.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon
        FROM menu_items m
        JOIN categories c ON m.category_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (categorySlug && categorySlug !== 'all') {
        sql += ' AND c.slug = ?';
        params.push(categorySlug);
      }

      if (search) {
        sql += ' AND (m.name LIKE ? OR m.description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY m.is_recommended DESC, m.is_popular DESC, m.id ASC';

      const items = db.prepare(sql).all(...params);
      return sendJson(res, 200, { success: true, data: items });
    }

    // 6. POST /api/orders (ลูกค้าสร้างออเดอร์)
    if (pathname === '/api/orders' && method === 'POST') {
      const body = await getRequestBody(req);
      const { order_type, table_number, customer_name, customer_phone, delivery_address, special_note, payment_method, items } = body;

      if (!order_type || !customer_name || !items || !items.length) {
        return sendJson(res, 400, { success: false, error: 'ข้อมูลคำสั่งซื้อไม่สมบูรณ์' });
      }

      // คำนวณยอดรวม
      let total = 0;
      for (const item of items) {
        total += item.unit_price * item.quantity;
      }

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `KM-${datePart}-${randomPart}`;

      const insertOrder = db.prepare(`
        INSERT INTO orders 
        (order_number, order_type, table_number, customer_name, customer_phone, delivery_address, special_note, total_amount, payment_method, payment_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertOrder.run(
        orderNumber,
        order_type,
        table_number || null,
        customer_name,
        customer_phone || null,
        delivery_address || null,
        special_note || null,
        total,
        payment_method || 'promptpay',
        payment_method === 'cash' ? 'pending' : 'paid',
        'pending'
      );

      const orderId = Number(result.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO order_items 
        (order_id, menu_item_id, item_name, option_size, pork_preference, extra_toppings, notes, unit_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of items) {
        insertItem.run(
          orderId,
          it.menu_item_id || null,
          it.item_name,
          it.option_size || 'normal',
          it.pork_preference || null,
          it.extra_toppings ? (Array.isArray(it.extra_toppings) ? it.extra_toppings.join(', ') : it.extra_toppings) : null,
          it.notes || null,
          it.unit_price,
          it.quantity,
          it.unit_price * it.quantity
        );
      }

      return sendJson(res, 201, {
        success: true,
        order_id: orderId,
        order_number: orderNumber,
        total_amount: total
      });
    }

    // 7. GET /api/orders/:id (ลูกค้าติดตามสถานะออเดอร์)
    if (pathname.startsWith('/api/orders/') && !pathname.endsWith('/status') && method === 'GET') {
      const param = pathname.split('/')[3];
      let order = null;

      if (/^\d+$/.test(param)) {
        order = db.prepare('SELECT * FROM orders WHERE id = ?').get(param);
      } else {
        order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(param);
      }

      if (!order) {
        return sendJson(res, 404, { success: false, error: 'ไม่พบคำสั่งซื้อนี้' });
      }

      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      return sendJson(res, 200, { success: true, data: { ...order, items } });
    }

    // 8. GET & POST /api/reviews
    if (pathname === '/api/reviews' && method === 'GET') {
      const reviews = db.prepare('SELECT * FROM reviews ORDER BY id DESC LIMIT 20').all();
      return sendJson(res, 200, { success: true, data: reviews });
    }

    if (pathname === '/api/reviews' && method === 'POST') {
      const body = await getRequestBody(req);
      const { customer_name, rating, comment } = body;

      if (!customer_name || !rating) {
        return sendJson(res, 400, { success: false, error: 'กรุณาระบุชื่อและคะแนนดาว' });
      }

      const stmt = db.prepare('INSERT INTO reviews (customer_name, rating, comment) VALUES (?, ?, ?)');
      stmt.run(customer_name, Math.min(5, Math.max(1, Number(rating))), comment || '');
      return sendJson(res, 201, { success: true, message: 'บันทึกรีวิวเรียบร้อยแล้ว' });
    }

    // 9. GET /api/settings (ข้อมูลทั่วไปของร้าน)
    if (pathname === '/api/settings' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM settings').all();
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return sendJson(res, 200, { success: true, data: settings });
    }

    // ---------------- PROTECTED STAFF APIS (เฉพาะพนักงานที่มีสิทธิ์) ----------------

    // ตรวจสอบ Token ก่อนเข้าถึง API หลังร้าน
    const isStaffEndpoint = 
      (pathname === '/api/orders' && method === 'GET') ||
      (pathname.startsWith('/api/orders/') && pathname.endsWith('/status')) ||
      (pathname === '/api/menu' && method === 'POST') ||
      (pathname.startsWith('/api/menu/') && ['PUT', 'DELETE'].includes(method)) ||
      (pathname === '/api/stats' && method === 'GET') ||
      (pathname === '/api/settings' && method === 'POST');

    if (isStaffEndpoint) {
      const authStaff = getAuthStaff(req);
      if (!authStaff) {
        return sendJson(res, 401, {
          success: false,
          error: 'Unauthorized: เฉพาะพนักงานที่เข้าสู่ระบบเท่านั้นจึงจะสามารถเข้าถึงส่วนนี้ได้'
        });
      }
    }

    // 10. GET /api/orders (รายการออเดอร์สำหรับห้องครัว & POS)
    if (pathname === '/api/orders' && method === 'GET') {
      const status = parsedUrl.searchParams.get('status');
      let sql = 'SELECT * FROM orders WHERE 1=1';
      const params = [];

      if (status && status !== 'all') {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY id DESC';

      const orders = db.prepare(sql).all(...params);
      const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
      const populatedOrders = orders.map(ord => ({
        ...ord,
        items: getItems.all(ord.id)
      }));

      return sendJson(res, 200, { success: true, data: populatedOrders });
    }

    // 11. PATCH /api/orders/:id/status (อัปเดตสถานะออเดอร์)
    if (pathname.startsWith('/api/orders/') && pathname.endsWith('/status') && method === 'PATCH') {
      const id = pathname.split('/')[3];
      const body = await getRequestBody(req);
      const { status, payment_status } = body;

      const validStatuses = ['pending', 'cooking', 'ready', 'completed', 'cancelled'];
      if (status && !validStatuses.includes(status)) {
        return sendJson(res, 400, { success: false, error: 'สถานะไม่ถูกต้อง' });
      }

      if (status && payment_status) {
        db.prepare('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?').run(status, payment_status, id);
      } else if (status) {
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
      } else if (payment_status) {
        db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(payment_status, id);
      }

      return sendJson(res, 200, { success: true, message: 'อัปเดตสถานะสำเร็จ' });
    }

    // 12. POST /api/menu (พนักงานเพิ่มเมนูใหม่)
    if (pathname === '/api/menu' && method === 'POST') {
      const body = await getRequestBody(req);
      const { category_id, name, description, price, price_special, image_url, badge, is_popular, is_recommended, in_stock } = body;

      if (!category_id || !name || price === undefined) {
        return sendJson(res, 400, { success: false, error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
      }

      const stmt = db.prepare(`
        INSERT INTO menu_items 
        (category_id, name, description, price, price_special, image_url, badge, is_popular, is_recommended, in_stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        category_id,
        name,
        description || '',
        Number(price),
        price_special ? Number(price_special) : null,
        image_url || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
        badge || '',
        is_popular ? 1 : 0,
        is_recommended ? 1 : 0,
        in_stock !== undefined ? (in_stock ? 1 : 0) : 1
      );

      return sendJson(res, 201, { success: true, id: Number(result.lastInsertRowid) });
    }

    // 13. PUT /api/menu/:id (พนักงานแก้ไขเมนู)
    if (pathname.startsWith('/api/menu/') && method === 'PUT') {
      const id = pathname.split('/')[3];
      const body = await getRequestBody(req);
      const { category_id, name, description, price, price_special, image_url, badge, is_popular, is_recommended, in_stock } = body;

      const stmt = db.prepare(`
        UPDATE menu_items SET
          category_id = COALESCE(?, category_id),
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          price_special = ?,
          image_url = COALESCE(?, image_url),
          badge = COALESCE(?, badge),
          is_popular = COALESCE(?, is_popular),
          is_recommended = COALESCE(?, is_recommended),
          in_stock = COALESCE(?, in_stock)
        WHERE id = ?
      `);

      stmt.run(
        category_id,
        name,
        description,
        price !== undefined ? Number(price) : undefined,
        price_special !== undefined ? (price_special ? Number(price_special) : null) : undefined,
        image_url,
        badge,
        is_popular !== undefined ? (is_popular ? 1 : 0) : undefined,
        is_recommended !== undefined ? (is_recommended ? 1 : 0) : undefined,
        in_stock !== undefined ? (in_stock ? 1 : 0) : undefined,
        id
      );

      return sendJson(res, 200, { success: true, message: 'อัปเดตเมนูสำเร็จ' });
    }

    // 14. DELETE /api/menu/:id (พนักงานลบเมนู)
    if (pathname.startsWith('/api/menu/') && method === 'DELETE') {
      const id = pathname.split('/')[3];
      db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
      return sendJson(res, 200, { success: true, message: 'ลบเมนูเรียบร้อยแล้ว' });
    }

    // 15. GET /api/stats (สถิติรายรับและยอดขาย)
    if (pathname === '/api/stats' && method === 'GET') {
      const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status != 'cancelled'").get().total;
      const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
      const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'cooking')").get().count;
      const completedOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count;

      const topDishes = db.prepare(`
        SELECT item_name, SUM(quantity) as sold_count, SUM(subtotal) as total_sales
        FROM order_items
        GROUP BY item_name
        ORDER BY sold_count DESC
        LIMIT 5
      `).all();

      return sendJson(res, 200, {
        success: true,
        data: {
          totalRevenue,
          totalOrders,
          pendingOrders,
          completedOrders,
          topDishes
        }
      });
    }

    // 16. POST /api/settings (อัปเดตการตั้งค่าร้าน)
    if (pathname === '/api/settings' && method === 'POST') {
      const body = await getRequestBody(req);
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries(body)) {
        stmt.run(k, String(v));
      }
      return sendJson(res, 200, { success: true, message: 'บันทึกการตั้งค่าแล้ว' });
    }

    // ---------------- STATIC FILE SERVER ----------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // ป้องกัน Path Traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found - ร้านข้าวขาหมูพาสเทล');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });

  } catch (error) {
    console.error('Server Error:', error);
    sendJson(res, 500, { success: false, error: 'Internal Server Error', message: error.message });
  }
});

server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log('🌸 ร้านข้าวขาหมูพาสเทล "หวานละมุน" Web Application 🌸');
  console.log(`✨ เว็บแอปพลิเคชันกำลังทำงานที่: http://localhost:${PORT}`);
  console.log(`🔐 ระบบพนักงาน / POS Admin: http://localhost:${PORT}/admin.html`);
  console.log('💾 เชื่อมต่อฐานข้อมูล SQLite (khamoo.db) เรียบร้อยแล้ว');
  console.log('----------------------------------------------------');
});
