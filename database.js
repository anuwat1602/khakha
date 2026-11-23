// database.js - ระบบฐานข้อมูล SQLite สำหรับร้านข้าวขาหมูพาสเทล
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const dbPath = path.join(__dirname, 'khamoo.db');
const db = new DatabaseSync(dbPath);

// ฟังก์ชันเข้ารหัสรหัสผ่าน
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_khamoo_pastel_secret').digest('hex');
}

// สร้างตารางข้อมูล
function initDatabase() {
  // เปิด Foreign Keys
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. ตารางพนักงาน (Staff)
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL, -- 'manager', 'cashier', 'chef'
      pin TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. ตาราง Session การล็อกอินของพนักงาน
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_sessions (
      token TEXT PRIMARY KEY,
      staff_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE
    );
  `);

  // 3. ตารางหมวดหมู่อาหาร
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0
    );
  `);

  // 4. ตารางเมนูอาหาร
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      price_special REAL,
      image_url TEXT,
      badge TEXT,
      is_popular INTEGER DEFAULT 0,
      is_recommended INTEGER DEFAULT 0,
      in_stock INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id)
    );
  `);

  // 5. ตารางออเดอร์
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      order_type TEXT NOT NULL, -- 'dine-in', 'takeaway', 'delivery'
      table_number TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      delivery_address TEXT,
      special_note TEXT,
      total_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'promptpay', -- 'promptpay', 'cash'
      payment_status TEXT DEFAULT 'pending', -- 'pending', 'paid'
      status TEXT DEFAULT 'pending', -- 'pending', 'cooking', 'ready', 'completed', 'cancelled'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. ตารางรายการอาหารในออเดอร์
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      item_name TEXT NOT NULL,
      option_size TEXT DEFAULT 'normal', -- 'normal', 'special'
      pork_preference TEXT, -- 'เนื้อหนัง', 'เนื้อล้วน', 'หนังล้วน', 'คากิ'
      extra_toppings TEXT,
      notes TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
    );
  `);

  // 7. ตารางรีวิวจากลูกค้า
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 8. ตารางการตั้งค่าร้าน
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  seedInitialData();
}

// ลงข้อมูลตัวอย่างเริ่มต้น
function seedInitialData() {
  // บัญชีพนักงานเริ่มต้น
  const staffCount = db.prepare('SELECT COUNT(*) as count FROM staff').get().count;
  if (staffCount === 0) {
    const insertStaff = db.prepare(`
      INSERT INTO staff (username, password_hash, full_name, role, pin)
      VALUES (?, ?, ?, ?, ?)
    `);
    // 1. ผู้จัดการร้าน (Manager)
    insertStaff.run('admin', hashPassword('khamoo888'), 'คุณหวาน ผู้จัดการร้าน 🌸', 'manager', '8888');
    // 2. พนักงานแคชเชียร์ (Cashier)
    insertStaff.run('cashier01', hashPassword('1234'), 'น้องมะลิ แคชเชียร์ 🎀', 'cashier', '1111');
    // 3. หัวหน้าพ่อครัว (Chef)
    insertStaff.run('chef01', hashPassword('1234'), 'เชฟสมหมาย หัวหน้าครัว 👨‍🍳', 'chef', '2222');
  }

  // ตรวจสอบหมวดหมู่
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)');
    insertCat.run('ข้าวขาหมู & คากิ', 'rice', '🍛', 1);
    insertCat.run('กับข้าวพะโล้รวมมิตร', 'dish', '🍲', 2);
    insertCat.run('ซุป & ต้มตุ๋นร้อนๆ', 'soup', '🥣', 3);
    insertCat.run('เครื่องเคียง & ข้าวสวย', 'topping', '🥚', 4);
    insertCat.run('เครื่องดื่ม & ของหวานพาสเทล', 'drinks', '🧋', 5);
  }

  // ตรวจสอบเมนูอาหาร
  const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get().count;
  if (menuCount === 0) {
    const insertMenu = db.prepare(`
      INSERT INTO menu_items 
      (category_id, name, description, price, price_special, image_url, badge, is_popular, is_recommended, in_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleItems = [
      [1, 'ข้าวขาหมูเนื้อหนังนุ่มละมุน (Signature)', 'ขาหมูตุ๋นยาจีน 12 ชม. เนื้อนุ่มละลายในปาก หนังเด้งดึ๋ง เสิร์ฟพร้อมผักกาดดองต้มและน้ำส้มพริกดองสูตรโบราณ', 65, 75, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', 'ยอดฮิต 💖', 1, 1, 1],
      [1, 'ข้าวคากิเอ็นแก้วดึ๋งดั๋ง', 'คากิตุ๋นจนเปื่อย เอ็นแก้วนุ่มหนึบ เต็มไปด้วยคอลลาเจน ทานคู่กับข้าวสวยหอมมะลิร้อนๆ', 75, 85, 'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80', 'คอลลาเจนเน้นๆ ✨', 1, 1, 1],
      [1, 'ข้าวขาหมูรวมมิตรทรงเครื่อง', 'จัดเต็มความฟิน รวมเนื้อ + หนัง + ไส้พะโล้ + ไข่ต้มยางมะตูมเยิ้มๆ ครบเครื่องในจานเดียว', 85, 95, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80', 'ขายดีอันดับ 1 👑', 1, 1, 1],
      [1, 'ข้าวขาหมูเนื้อล้วนเพื่อสุขภาพ', 'เนื้อสะโพกหมูตุ๋นไร้มัน นุ่มชุ่มฉ่ำ ไม่แห้งฝืดคอ อร่อยฟินแบบไม่อ้วน', 65, 75, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80', 'ไร้มัน 🥗', 0, 1, 1],
      [2, 'ขาหมูจานใหญ่รวมมิตร (กับข้าว)', 'ขาหมูสับจานเปลใหญ่ รวมเนื้อ หนัง ไส้ คากิ พร้อมน้ำราดพะโล้เข้มข้นสูตรลับเฉพาะ เหมาะสำหรับ 2-3 ท่าน', 160, 220, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', 'คุ้มค่า 👨‍👩‍👧', 1, 1, 1],
      [2, 'คากิพะโล้ล้วนจานเปล', 'คากิล้วน 2 ชิ้นโตๆ เคี่ยวเข้าเนื้อ เอ็นนุ่มเด้ง หอมกลิ่นโป๊ยกั๊กและอบเชยหอมกรุ่น', 130, 180, 'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80', 'แนะนำ 🌟', 0, 1, 1],
      [2, 'ไส้หมูพะโล้ตุ๋นยาจีน', 'ไส้ใหญ่นุ่มหนึบ สะอาด ไม่ขม เคี่ยวจนนุ่มเปื่อยวางบนผักกาดดองต้มร้อนๆ', 90, 120, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80', 'นุ่มละมุน 🌸', 0, 0, 1],
      [3, 'ต้มมะระซี่โครงหมูเก๋ากี้', 'ซุปกระดูกหมูหวานน้ำต้มกระดูก มะระต้มไม่ขม ชุ่มคอ โรยเก๋ากี้หวานธรรมชาติ ซดคล่องคอ', 55, 65, 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&auto=format&fit=crop&q=80', 'ซดคล่องคอ 🥣', 1, 1, 1],
      [3, 'ต้มผักกาดดองกระดูกอ่อน', 'รสชาติเปรี้ยวเค็มกลมกล่อม กระดูกอ่อนเคี้ยวกรุบๆ ช่วยตัดเลี่ยนได้ดีเยี่ยม', 55, 65, 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=600&auto=format&fit=crop&q=80', 'ตัดเลี่ยนสดชื่น 🌿', 0, 1, 1],
      [4, 'ไข่พะโล้ยางมะตูมฟองโต (2 ฟอง)', 'ไข่เป็ดต้มยางมะตูมเยิ้มๆ แช่ในน้ำพะโล้เข้มข้น รสชาติกลมกล่อมเข้าถึงไข่แดง', 25, null, 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&auto=format&fit=crop&q=80', 'ยางมะตูมเยิ้ม 🥚', 1, 1, 1],
      [4, 'ผักกาดดองผัดน้ำมันงาพาสเทล', 'ผักกาดดองสูตรเด็ด เปรี้ยวนิด หวานเค็มหน่อย ผัดคลุกเคล้าน้ำมันงาหอมกรุ่น', 20, null, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80', 'สูตรลับ 🥬', 0, 0, 1],
      [4, 'ข้าวหอมมะลิสุรินทร์ร้อนๆ', 'ข้าวสวยหอมมะลิแท้ หุงนุ่มละมุน เม็ดสวยเรียงตัว ทานกับน้ำพะโล้ฟินสุดๆ', 15, null, 'https://images.unsplash.com/photo-1516684732162-798a0062be99?w=600&auto=format&fit=crop&q=80', 'นุ่มหอม 🌾', 0, 0, 1],
      [5, 'ชาไทยเย็นนมสดพาสเทล', 'ชาไทยสูตรโบราณหอมเข้มข้น ท็อปด้วยโฟมนมสดเนียนนุ่ม หวานกำลังดี สีน่ารักสดใส', 35, null, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80', 'ซิกเนเจอร์ 🧋', 1, 1, 1],
      [5, 'น้ำเก๊กฮวยหอมหมื่นลี้เย็นฉ่ำ', 'น้ำเก๊กฮวยต้มสดหวานน้อย หอมกลิ่นดอกเก๊กฮวยแท้ ดื่มแล้วสดชื่น ดับกระหายคลายร้อน', 25, null, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&auto=format&fit=crop&q=80', 'สดชื่น 🌼', 0, 1, 1],
      [5, 'ลอดช่องสยามกะทิสดอบควันเทียน', 'เส้นลอดช่องใบเตยเหนียวนุ่ม น้ำกะทิเคี่ยวกับน้ำตาลมะพร้าวแท้ หอมควันเทียนชื่นใจ', 35, null, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80', 'ของหวานยอดฮิต 🍧', 1, 1, 1]
    ];

    sampleItems.forEach(item => insertMenu.run(...item));
  }

  // ข้อมูลรีวิวตัวอย่าง
  const reviewCount = db.prepare('SELECT COUNT(*) as count FROM reviews').get().count;
  if (reviewCount === 0) {
    const insertReview = db.prepare('INSERT INTO reviews (customer_name, rating, comment) VALUES (?, ?, ?)');
    insertReview.run('น้องพลอย สายกินจุ 🌸', 5, 'ขาหมูนุ่มละมุนมากกก น้ำพะโล้รสชาติกลมกล่อมไม่เค็มเกินไป ชอบไข่ยางมะตูมที่สุดค่ะ ร้านสีพาสเทลน่ารักมากๆ');
    insertReview.run('พี่ต้น คนรักคากิ ✨', 5, 'คากิคือที่สุดของที่สุด เอ็นแก้วเคี้ยวเด้งฟินมาก สั่งซุปมะระมาตัดเลี่ยน ซดคล่องคอมากครับ');
    insertReview.run('คุณเมย์ ปากหวาน 💕', 5, 'ร้านสะอาด สั่งเดลิเวอรี่มาแพ็กเกจน่ารัก แยกน้ำพะโล้กับผักดองมาอย่างดี ชาไทยเย็นอร่อยมาก');
  }

  // การตั้งค่าร้าน
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get().count;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('store_name', 'ร้านขาหมูพาสเทล "หวานละมุน" (Wan Lamun)');
    insertSetting.run('store_slogan', 'ขาหมูสูตรโบราณตุ๋น 12 ชม. ละมุนลิ้นในบรรยากาศพาสเทล');
    insertSetting.run('store_status', 'open');
    insertSetting.run('promptpay_number', '089-123-4567');
    insertSetting.run('promptpay_name', 'ร้านข้าวขาหมูหวานละมุน');
    insertSetting.run('contact_phone', '089-123-4567');
    insertSetting.run('store_address', '88/9 ถ.พาสเทลสายหวาน แขวงบางรัก เขตบางรัก กทม.');
    insertSetting.run('opening_hours', 'เปิดบริการทุกวัน 08:30 - 20:30 น.');
  }

  // ออเดอร์ตัวอย่าง
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  if (orderCount === 0) {
    const insertOrder = db.prepare(`
      INSERT INTO orders (order_number, order_type, table_number, customer_name, customer_phone, total_amount, payment_method, payment_status, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, item_name, option_size, pork_preference, extra_toppings, notes, unit_price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res1 = insertOrder.run('KM-20261121-001', 'dine-in', 'โต๊ะ 3', 'คุณปอ', '0812345678', 125, 'promptpay', 'paid', 'cooking');
    const order1Id = Number(res1.lastInsertRowid);
    insertItem.run(order1Id, 1, 'ข้าวขาหมูเนื้อหนังนุ่มละมุน', 'special', 'เนื้อหนัง', 'ไข่ยางมะตูม', 'ขอน้ำราดชุ่มๆ ค่ะ', 75, 1, 75);
    insertItem.run(order1Id, 8, 'ต้มมะระซี่โครงหมูเก๋ากี้', 'normal', null, null, null, 50, 1, 50);

    const res2 = insertOrder.run('KM-20261121-002', 'takeaway', null, 'คุณเบนซ์', '0898765432', 120, 'promptpay', 'paid', 'ready');
    const order2Id = Number(res2.lastInsertRowid);
    insertItem.run(order2Id, 3, 'ข้าวขาหมูรวมมิตรทรงเครื่อง', 'normal', 'เนื้อหนัง', 'ไส้พะโล้', 'แยกน้ำราด', 85, 1, 85);
    insertItem.run(order2Id, 13, 'ชาไทยเย็นนมสดพาสเทล', 'normal', null, null, 'หวานน้อย 50%', 35, 1, 35);
  }
}

initDatabase();

module.exports = {
  db,
  initDatabase,
  hashPassword
};
