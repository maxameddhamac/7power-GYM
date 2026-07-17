// Supabase Database Integration State Variables
let dbClient = null;
let dbConfig = {
    url: '',
    key: '',
    connected: false
};

// 7Power Gym System State Management
let state = {
    theme: 'light',
    view: 'dashboard',
    subscription: {
        expiry: null // Will initialize on first load
    },
    shifts: {
        maalintii: { current: 142, capacity: 200, label: 'Maalintii Shift', hours: '05:00 AM - 11:30 AM' },
        galabtii: { current: 88, capacity: 150, label: 'Galabtii Shift', hours: '12:00 PM - 04:30 PM' },
        habeenkii: { current: 285, capacity: 300, label: 'Habeenkii Shift', hours: '05:00 PM - 10:00 PM' }
    },
    products: {
        'prod-01': { name: 'Protein Powder', price: 45.00, category: 'Supplements', stock: 15, desc: 'Premium whey protein for muscle recovery.', image: 'assets/protein_powder.png', tempQty: 0 },
        'prod-02': { name: 'Creatine Monohydrate', price: 25.00, category: 'Supplements', stock: 20, desc: 'Pure micronized creatine to boost physical performance.', image: 'assets/creatine.png', tempQty: 0 },
        'prod-03': { name: 'Gym Wear / Dress', price: 30.00, category: 'Apparel', stock: 12, desc: 'High-breathability dry-fit activewear set.', image: 'assets/gym_wear.png', tempQty: 0 },
        'prod-04': { name: 'Gym Shoes', price: 55.00, category: 'Apparel', stock: 8, desc: 'Ergonomic, high-grip athletic training footwear.', image: 'assets/gym_shoes.png', tempQty: 0 },
        'prod-05': { name: 'Gym Gloves', price: 10.00, category: 'Gear & Accessories', stock: 25, desc: 'Padded gloves for maximum grip and hand protection.', image: 'assets/gym_gloves.png', tempQty: 0 },
        'prod-06': { name: 'Premium Drinking Water', price: 0.50, category: 'Beverages', stock: 100, desc: 'Chilled 750ml mineral water for optimal hydration.', image: 'assets/drinking_water.png', tempQty: 0 }
    },
    cart: [], // [{ code, quantity }]
    ledger: [], // [{ id, type, amount, desc, senderPhone, refNo, status: 'pending_verification', items: [], timestamp }]
    flashSaleSeconds: 2277 // 37 minutes and 57 seconds
};

// Global Checkout Variables
let currentCheckout = {
    type: null, // 'subscription' | 'store'
    amount: 0,
    desc: '',
    items: [] // For store purchases
};

// Init application on load
window.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    initTimers();
    renderAll();
    setupTheme();
    loadSupabaseConfig(); // Dynamically load credentials and sync
});

// Load state from local storage or set defaults
function loadStateFromStorage() {
    const savedState = localStorage.getItem('7power_gym_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            // Deep copy loaded items
            state.theme = parsed.theme || 'light';
            state.view = parsed.view || 'dashboard';
            state.subscription = parsed.subscription || {};
            if (!state.subscription.expiry) {
                // Default: 8 days, 14 hours, 22 minutes, 59 seconds
                state.subscription.expiry = Date.now() + 742979000;
            }
            state.shifts = parsed.shifts || state.shifts;
            
            // Keep product details, load stock updates
            if (parsed.products) {
                Object.keys(state.products).forEach(code => {
                    if (parsed.products[code]) {
                        state.products[code].stock = parsed.products[code].stock;
                    }
                });
            }
            state.cart = parsed.cart || [];
            state.ledger = parsed.ledger || [];
            state.flashSaleSeconds = parsed.flashSaleSeconds !== undefined ? parsed.flashSaleSeconds : 2277;
        } catch (e) {
            console.error('Error loading state from localStorage:', e);
            resetToDefaults();
        }
    } else {
        resetToDefaults();
    }
}

// Reset state to initial defaults
function resetToDefaults() {
    state.theme = 'light';
    state.view = 'dashboard';
    state.subscription.expiry = Date.now() + 742979000; // 8d 14h 22m 59s
    state.shifts = {
        maalintii: { current: 142, capacity: 200, label: 'Maalintii Shift', hours: '05:00 AM - 11:30 AM' },
        galabtii: { current: 88, capacity: 150, label: 'Galabtii Shift', hours: '12:00 PM - 04:30 PM' },
        habeenkii: { current: 285, capacity: 300, label: 'Habeenkii Shift', hours: '05:00 PM - 10:00 PM' }
    };
    // Reset product stock counts
    state.products['prod-01'].stock = 15;
    state.products['prod-02'].stock = 20;
    state.products['prod-03'].stock = 12;
    state.products['prod-04'].stock = 8;
    state.products['prod-05'].stock = 25;
    state.products['prod-06'].stock = 100;
    
    // Reset inputs
    Object.keys(state.products).forEach(code => state.products[code].tempQty = 0);
    state.cart = [];
    state.ledger = [];
    state.flashSaleSeconds = 2277;
    saveState();
}

// Save active state to storage
function saveState() {
    localStorage.setItem('7power_gym_state', JSON.stringify(state));
}

// Setup background countdown ticks
function initTimers() {
    // 1 Hz main update loop
    setInterval(() => {
        updateSubscriptionTimer();
        updateFlashSaleTimer();
    }, 1000);

    // Run first ticks immediately
    updateSubscriptionTimer();
    updateFlashSaleTimer();
}

// Calculate subscription countdown
function updateSubscriptionTimer() {
    const now = Date.now();
    const expiry = state.subscription.expiry;
    const remaining = expiry - now;

    const daysEl = document.getElementById('countdown-days');
    const hoursEl = document.getElementById('countdown-hours');
    const minsEl = document.getElementById('countdown-mins');
    const secsEl = document.getElementById('countdown-secs');
    const statusPill = document.getElementById('profile-status-pill');

    if (remaining <= 0) {
        // Expired
        if (daysEl) daysEl.innerText = '00';
        if (hoursEl) hoursEl.innerText = '00';
        if (minsEl) minsEl.innerText = '00';
        if (secsEl) secsEl.innerText = '00';

        if (statusPill) {
            statusPill.innerText = 'EXPIRED';
            statusPill.className = 'status-pill expired';
        }
        return;
    }

    // Mathematical divisions from SRS
    const secondsTotal = Math.floor(remaining / 1000);
    const minutesTotal = Math.floor(secondsTotal / 60);
    const hoursTotal = Math.floor(minutesTotal / 60);

    const days = Math.floor(hoursTotal / 24);
    const hours = hoursTotal % 24;
    const minutes = minutesTotal % 60;
    const seconds = secondsTotal % 60;

    // Pad double digits
    if (daysEl) daysEl.innerText = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.innerText = String(hours).padStart(2, '0');
    if (minsEl) minsEl.innerText = String(minutes).padStart(2, '0');
    if (secsEl) secsEl.innerText = String(seconds).padStart(2, '0');

    // Dynamic User Profile card status badge styling
    if (statusPill) {
        const threeDaysMs = 1000 * 60 * 60 * 24 * 3;
        if (remaining > threeDaysMs) {
            statusPill.innerText = 'ACTIVE';
            statusPill.className = 'status-pill active';
        } else {
            statusPill.innerText = 'NEAR EXPIRATION';
            statusPill.className = 'status-pill warning';
        }
    }
}

// Tick down Convenience Store Flash Sale countdown
function updateFlashSaleTimer() {
    if (state.flashSaleSeconds > 0) {
        state.flashSaleSeconds--;
    } else {
        state.flashSaleSeconds = 3600; // Reset to 1 hr if it runs out
    }
    
    // Save periodically
    if (state.flashSaleSeconds % 10 === 0) {
        saveState();
    }

    const minutes = Math.floor(state.flashSaleSeconds / 60);
    const seconds = state.flashSaleSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const displayMins = minutes % 60;

    const flashTimerEl = document.getElementById('store-flash-countdown');
    if (flashTimerEl) {
        flashTimerEl.innerText = `${String(hours).padStart(2, '0')} : ${String(displayMins).padStart(2, '0')} : ${String(seconds).padStart(2, '0')}`;
    }
}

// Router for changing views (Dashboard/Convenience Store)
function switchView(viewName) {
    state.view = viewName;
    saveState();

    // Toggle menu button styles
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));

    const activeBtn = document.getElementById(`nav-${viewName}-btn`);
    if (activeBtn) activeBtn.classList.add('active');

    // Toggle view elements
    document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) targetView.classList.add('active');

    // Update view title
    const viewTitle = document.getElementById('view-title');
    if (viewTitle) {
        viewTitle.innerText = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    }

    renderAll();
}

// Theme management (Light vs Dark Canvas Background)
function setupTheme() {
    const body = document.body;
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');

    if (state.theme === 'dark') {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
    } else {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
    }
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    saveState();
    setupTheme();
    triggerToast(`Theme switched to ${state.theme === 'light' ? 'Light Mode' : 'Dark Mode'}.`, 'info');
    updateSupabaseSetting('theme', { theme: state.theme });
}

// Rendering orchestration
function renderAll() {
    renderDashboard();
    renderProducts();
    renderCart();
    renderLedger();
}

// Dashboard views rendering
function renderDashboard() {
    // Render Shifts Traffic
    Object.keys(state.shifts).forEach(shiftKey => {
        const shift = state.shifts[shiftKey];
        const currentEl = document.getElementById(`shift-${shiftKey}-current`);
        const progressEl = document.getElementById(`shift-${shiftKey}-progress`);
        const cardEl = document.getElementById(`shift-${shiftKey}`);

        if (currentEl) currentEl.innerText = shift.current;
        
        const percentage = Math.min(((shift.current / shift.capacity) * 100), 100);
        if (progressEl) {
            progressEl.style.width = `${percentage}%`;
        }

        // Apply warning styles if > 90% capacity (Habeenkii warnings)
        if (cardEl && progressEl && currentEl) {
            if (percentage >= 90) {
                cardEl.classList.add('warning');
                progressEl.classList.add('bg-red', 'animate-pulse');
                currentEl.classList.add('text-red');
            } else {
                cardEl.classList.remove('warning');
                progressEl.classList.remove('bg-red', 'animate-pulse');
                currentEl.classList.remove('text-red');
            }
        }
    });
}

// Catalog generator
function renderProducts() {
    const gridContainer = document.getElementById('product-grid-container');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    Object.keys(state.products).forEach(code => {
        const prod = state.products[code];
        const card = document.createElement('div');
        card.className = 'product-card card';

        const isOutOfStock = prod.stock <= 0;

        card.innerHTML = `
            <div class="product-image-container">
                <span class="category-badge">${prod.category.toUpperCase()}</span>
                <img src="${prod.image}" alt="${prod.name}" class="product-image" onerror="this.style.display='none'">
            </div>
            <div class="product-details">
                <div class="product-title-row">
                    <h4 class="product-name">${prod.name}</h4>
                    <span class="product-price">$${prod.price.toFixed(2)}</span>
                </div>
                <p class="product-desc">${prod.desc}</p>
                <div class="stock-tag ${isOutOfStock ? 'stock-out' : ''}">
                    ${isOutOfStock ? 'OUT OF STOCK' : `Stock: ${prod.stock} units`}
                </div>
                <div class="product-action-row">
                    <div class="qty-control">
                        <button class="qty-btn" onclick="updateCatalogQty('${code}', -1)" ${isOutOfStock ? 'disabled' : ''}>-</button>
                        <span class="qty-val" id="catalog-qty-${code}">${prod.tempQty}</span>
                        <button class="qty-btn" onclick="updateCatalogQty('${code}', 1)" ${isOutOfStock ? 'disabled' : ''}>+</button>
                    </div>
                    <button class="add-cart-btn" onclick="addSelectedToCart('${code}')" title="Add to Tray" ${isOutOfStock ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
        gridContainer.appendChild(card);
    });
}

// Adjust quantity indicator in the product card listing
function updateCatalogQty(code, delta) {
    const prod = state.products[code];
    if (!prod) return;

    let newVal = prod.tempQty + delta;
    if (newVal < 0) newVal = 0;
    if (newVal > prod.stock) {
        triggerToast(`Cannot exceed remaining stock limit (${prod.stock} items).`, 'error');
        newVal = prod.stock;
    }

    prod.tempQty = newVal;
    const qtyValEl = document.getElementById(`catalog-qty-${code}`);
    if (qtyValEl) qtyValEl.innerText = newVal;
}

// Push item quantity from card into the Cart Tray
function addSelectedToCart(code) {
    const prod = state.products[code];
    if (!prod || prod.tempQty <= 0) {
        triggerToast('Please select a quantity greater than zero.', 'error');
        return;
    }

    const cartIndex = state.cart.findIndex(item => item.code === code);
    
    // Check total limit inside cart vs remaining stock
    let existingQty = 0;
    if (cartIndex > -1) {
        existingQty = state.cart[cartIndex].quantity;
    }

    if (existingQty + prod.tempQty > prod.stock) {
        triggerToast(`Cannot add ${prod.tempQty} more. Total cart quantity exceeds stock limit (${prod.stock}).`, 'error');
        return;
    }

    if (cartIndex > -1) {
        state.cart[cartIndex].quantity += prod.tempQty;
    } else {
        state.cart.push({ code: code, quantity: prod.tempQty });
    }

    triggerToast(`Added ${prod.tempQty}x ${prod.name} to your tray.`, 'success');
    
    // Clear catalog selection counters
    prod.tempQty = 0;
    
    saveState();
    renderAll();
}

// Render invoice lists, item tallies, subtotals, tax
function renderCart() {
    const itemsWrapper = document.getElementById('cart-items-wrapper');
    const itemCountEl = document.getElementById('cart-item-count');
    const subtotalEl = document.getElementById('cart-subtotal');
    const taxEl = document.getElementById('cart-tax');
    const totalEl = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-action-btn');

    if (!itemsWrapper) return;

    if (state.cart.length === 0) {
        itemsWrapper.innerHTML = `
            <div class="cart-empty-state">
                <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p>Tray is empty</p>
            </div>
        `;
        if (itemCountEl) itemCountEl.innerText = '0';
        if (subtotalEl) subtotalEl.innerText = '$0.00';
        if (taxEl) taxEl.innerText = '$0.00';
        if (totalEl) totalEl.innerText = '$0.00';
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
    }

    itemsWrapper.innerHTML = '';
    let subtotal = 0;
    let totalItems = 0;

    state.cart.forEach(item => {
        const prod = state.products[item.code];
        if (!prod) return;

        const itemTotal = prod.price * item.quantity;
        subtotal += itemTotal;
        totalItems += item.quantity;

        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <div class="cart-item-details">
                <span class="cart-item-name">${prod.name}</span>
                <span class="cart-item-qty-price">${item.quantity}x $${prod.price.toFixed(2)}</span>
            </div>
            <div class="cart-item-price-col">
                <span class="cart-item-total">$${itemTotal.toFixed(2)}</span>
                <button class="remove-cart-item-btn" onclick="removeFromCart('${item.code}')" title="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>
        `;
        itemsWrapper.appendChild(itemEl);
    });

    const tax = subtotal * 0.05; // 5% tax from design
    const total = subtotal + tax;

    if (itemCountEl) itemCountEl.innerText = totalItems;
    if (subtotalEl) subtotalEl.innerText = `$${subtotal.toFixed(2)}`;
    if (taxEl) taxEl.innerText = `$${tax.toFixed(2)}`;
    if (totalEl) totalEl.innerText = `$${total.toFixed(2)}`;
    if (checkoutBtn) checkoutBtn.disabled = false;
}

// Modify tray items directly
function removeFromCart(code) {
    const index = state.cart.findIndex(item => item.code === code);
    if (index > -1) {
        const prodName = state.products[code] ? state.products[code].name : '';
        state.cart.splice(index, 1);
        triggerToast(`Removed ${prodName} from tray.`, 'info');
        saveState();
        renderAll();
    }
}

// Trigger checkout billing flows
function openCheckout(type, amount, desc, items = []) {
    currentCheckout.type = type;
    currentCheckout.amount = amount;
    currentCheckout.desc = desc;
    currentCheckout.items = items;

    // Compile Merchant code according to USSD format in SRS
    // USSD String = *880*6286807*Total Cost#
    const formattedAmount = amount.toFixed(2);
    const ussdString = `*880*6286807*${formattedAmount}#`;

    const codeEl = document.getElementById('generated-ussd-code');
    const descEl = document.getElementById('checkout-item-desc');
    const modal = document.getElementById('checkout-modal');

    if (codeEl) codeEl.innerText = ussdString;
    if (descEl) descEl.innerText = `${desc} - Total: $${formattedAmount}`;
    
    // Clear previous inputs
    const phoneInput = document.getElementById('sender-phone');
    const refInput = document.getElementById('transaction-ref');
    if (phoneInput) phoneInput.value = '';
    if (refInput) refInput.value = '';

    if (modal) modal.classList.add('active');
}

// Convenience store tray checkout button triggers EVC Plus popup
function checkoutCart() {
    let subtotal = 0;
    const purchaseItems = [];

    state.cart.forEach(item => {
        const prod = state.products[item.code];
        if (prod) {
            subtotal += prod.price * item.quantity;
            purchaseItems.push({
                code: item.code,
                name: prod.name,
                price: prod.price,
                quantity: item.quantity
            });
        }
    });

    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    openCheckout('store', total, 'Gym Convenience Store Purchase', purchaseItems);
}

// Close payment modal
function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.remove('active');
}

// Copy Code string to clipboard helper
function copyUSSDCode() {
    const codeEl = document.getElementById('generated-ussd-code');
    if (!codeEl) return;

    navigator.clipboard.writeText(codeEl.innerText)
        .then(() => {
            triggerToast('USSD code copied to clipboard!', 'success');
        })
        .catch(err => {
            console.error('Copy failed:', err);
            triggerToast('Failed to copy. Please manually dial: ' + codeEl.innerText, 'error');
        });
}

// Submit payment receipts to ledger for verification queue
function submitTransaction(event) {
    event.preventDefault();

    const senderPhone = document.getElementById('sender-phone').value.trim();
    const refNo = document.getElementById('transaction-ref').value.trim();

    if (!senderPhone || !refNo) {
        triggerToast('Please populate both form details.', 'error');
        return;
    }

    // Append a pending request to ledger state
    const newTx = {
        id: 'TXN-' + Date.now(),
        type: currentCheckout.type,
        amount: currentCheckout.amount,
        desc: currentCheckout.desc,
        senderPhone: senderPhone,
        refNo: refNo,
        status: 'pending_verification',
        items: [...currentCheckout.items],
        timestamp: new Date().toISOString()
    };

    state.ledger.unshift(newTx);

    // If it was a store purchase, clear the tray checkout entries
    if (currentCheckout.type === 'store') {
        state.cart = [];
    }

    saveState();
    closeCheckoutModal();
    renderAll();

    triggerToast('Payment submitted. Awaiting Gym Admin verification.', 'success');
    insertSupabaseTransaction(newTx);
}

// Toggle Administration Sidebar Drawer Panel
function toggleAdminDrawer() {
    const drawer = document.getElementById('admin-drawer');
    if (drawer) {
        drawer.classList.toggle('active');
        
        // Sync simulator slider UI numbers on open
        if (drawer.classList.contains('active')) {
            Object.keys(state.shifts).forEach(shiftKey => {
                const shift = state.shifts[shiftKey];
                const slider = document.getElementById(`sim-${shiftKey}-slider`);
                const valLabel = document.getElementById(`sim-${shiftKey}-val`);
                if (slider) slider.value = shift.current;
                if (valLabel) valLabel.innerText = `${shift.current} / ${shift.capacity}`;
            });
        }
    }
}

// Dynamic Shift Capacity Simulator sliders
function simulateTraffic(shiftKey, value) {
    const parsedVal = parseInt(value, 10);
    const shift = state.shifts[shiftKey];
    if (!shift) return;

    shift.current = parsedVal;
    
    // Update labels inside admin panel
    const valLabel = document.getElementById(`sim-${shiftKey}-val`);
    if (valLabel) valLabel.innerText = `${parsedVal} / ${shift.capacity}`;

    saveState();
    renderDashboard();
    updateSupabaseShift(shiftKey, parsedVal);
}

// Ledger approval checks: validates records & commits state modifications
function renderLedger() {
    const listWrapper = document.getElementById('admin-ledger-list');
    if (!listWrapper) return;

    if (state.ledger.length === 0) {
        listWrapper.innerHTML = `
            <div class="ledger-empty-state">
                No transactions in the ledger queue.
            </div>
        `;
        return;
    }

    listWrapper.innerHTML = '';
    state.ledger.forEach(tx => {
        const itemEl = document.createElement('div');
        itemEl.className = 'ledger-item';
        
        let statusBadgeClass = 'warning';
        let statusText = 'Pending Verification';
        
        if (tx.status === 'approved') {
            statusBadgeClass = 'success';
            statusText = 'Approved & Added';
        } else if (tx.status === 'rejected') {
            statusBadgeClass = 'expired';
            statusText = 'Rejected';
        }

        const dateString = new Date(tx.timestamp).toLocaleString();

        let detailsHTML = '';
        if (tx.items && tx.items.length > 0) {
            detailsHTML = `
                <div class="ledger-row" style="margin-top: 6px; flex-direction: column; align-items: flex-start; gap: 4px; border-top: 1px dashed var(--border-color); padding-top: 6px;">
                    <span style="font-weight: 600; font-size: 11px;">PURCHASED PRODUCTS:</span>
                    ${tx.items.map(i => `<span style="font-size: 11px;">• ${i.quantity}x ${i.name} ($${i.price.toFixed(2)})</span>`).join('')}
                </div>
            `;
        }

        itemEl.innerHTML = `
            <div class="ledger-row">
                <span class="ledger-item-title">${tx.desc}</span>
                <span class="status-pill ${statusBadgeClass}">${statusText}</span>
            </div>
            <div class="ledger-row">
                <span>Ref Number:</span>
                <span class="ledger-item-val">${tx.refNo}</span>
            </div>
            <div class="ledger-row">
                <span>Sender Phone:</span>
                <span class="ledger-item-val">${tx.senderPhone}</span>
            </div>
            <div class="ledger-row">
                <span>Total Sum:</span>
                <span class="ledger-item-val" style="color: var(--time-accent); font-weight: 700;">$${tx.amount.toFixed(2)}</span>
            </div>
            <div class="ledger-row">
                <span>Time Sent:</span>
                <span>${dateString}</span>
            </div>
            ${detailsHTML}
            ${tx.status === 'pending_verification' ? `
                <div class="ledger-actions">
                    <button class="ledger-btn ledger-approve" onclick="approveTransaction('${tx.id}')">Approve</button>
                    <button class="ledger-btn ledger-reject" onclick="rejectTransaction('${tx.id}')">Reject</button>
                </div>
            ` : ''}
        `;
        listWrapper.appendChild(itemEl);
    });
}

// Commit approved transaction
function approveTransaction(id) {
    const tx = state.ledger.find(item => item.id === id);
    if (!tx || tx.status !== 'pending_verification') return;

    tx.status = 'approved';
    updateSupabaseTransactionStatus(tx.id, 'approved');

    if (tx.type === 'subscription') {
        // Add subscription days based on amount
        let addDays = 0;
        if (Math.abs(tx.amount - 15.00) < 0.01) {
            addDays = 30; // Monthly
        } else if (Math.abs(tx.amount - 120.00) < 0.01) {
            addDays = 365; // Yearly
        }

        const now = Date.now();
        // If expired or expiring soon, append relative to expiration or start fresh
        let currentExpiry = state.subscription.expiry;
        if (currentExpiry < now) {
            currentExpiry = now;
        }
        
        const extraMs = addDays * 24 * 60 * 60 * 1000;
        state.subscription.expiry = currentExpiry + extraMs;
        
        triggerToast(`Approved. Added ${addDays} days to subscription count.`, 'success');
        updateSupabaseSetting('subscription', state.subscription);
    } else if (tx.type === 'store') {
        // Deduct inventory items stock
        let outOfStockWarnings = [];
        tx.items.forEach(purchasedItem => {
            const product = state.products[purchasedItem.code];
            if (product) {
                product.stock = Math.max(0, product.stock - purchasedItem.quantity);
                updateSupabaseProductStock(purchasedItem.code, product.stock);
                if (product.stock === 0) {
                    outOfStockWarnings.push(product.name);
                }
            }
        });

        triggerToast(`Store purchase approved! Stock adjusted.`, 'success');
        if (outOfStockWarnings.length > 0) {
            triggerToast(`Warning: ${outOfStockWarnings.join(', ')} is now out of stock!`, 'error');
        }
    }

    saveState();
    renderAll();
}

// Reject transaction
function rejectTransaction(id) {
    const tx = state.ledger.find(item => item.id === id);
    if (!tx || tx.status !== 'pending_verification') return;

    tx.status = 'rejected';
    updateSupabaseTransactionStatus(tx.id, 'rejected');
    triggerToast('Transaction receipt rejected by admin.', 'info');
    saveState();
    renderAll();
}

// Admin ledger control helpers
function resetAppSimulation() {
    if (confirm('Are you sure you want to reset all variables to the initial demo values? This clears transaction history and resets the subscription timer.')) {
        resetToDefaults();
        renderAll();
        setupTheme();
        triggerToast('Simulation reset to factory default values.', 'info');
        if (dbConfig.connected) {
            syncAllDefaultsToSupabase();
        }
    }
}

// ==========================================
// Supabase Sync & Operations Helper Functions
// ==========================================

function loadSupabaseConfig() {
    const savedUrl = localStorage.getItem('7power_supabase_url');
    const savedKey = localStorage.getItem('7power_supabase_key');
    if (savedUrl && savedKey) {
        dbConfig.url = savedUrl;
        dbConfig.key = savedKey;
        
        // Populate fields in Admin Drawer if they exist
        const urlInput = document.getElementById('db-url');
        const keyInput = document.getElementById('db-key');
        if (urlInput) urlInput.value = savedUrl;
        if (keyInput) keyInput.value = savedKey;
        
        initSupabase(savedUrl, savedKey);
    }
}

async function initSupabase(url, key, verbose = false) {
    try {
        if (typeof supabase === 'undefined') {
            console.error('Supabase library not loaded yet.');
            updateDbStatus(false);
            return;
        }
        
        dbClient = supabase.createClient(url, key);
        
        // Test query to confirm credentials and connection
        const { data, error } = await dbClient.from('gym_shifts').select('key').limit(1);
        if (error) throw error;
        
        dbConfig.url = url;
        dbConfig.key = key;
        dbConfig.connected = true;
        
        localStorage.setItem('7power_supabase_url', url);
        localStorage.setItem('7power_supabase_key', key);
        
        updateDbStatus(true);
        if (verbose) {
            triggerToast('Connected to Supabase Database successfully!', 'success');
        }
        
        await syncFromSupabase();
    } catch (e) {
        console.error('Supabase initialization failed:', e);
        dbConfig.connected = false;
        dbClient = null;
        updateDbStatus(false);
        if (verbose) {
            triggerToast('Failed to connect to Supabase. Check credentials/tables.', 'error');
        }
    }
}

function updateDbStatus(isConnected) {
    const statusBadge = document.getElementById('db-status-badge');
    if (statusBadge) {
        if (isConnected) {
            statusBadge.innerText = 'CONNECTED';
            statusBadge.className = 'status-pill active';
        } else {
            statusBadge.innerText = 'OFFLINE';
            statusBadge.className = 'status-pill expired';
        }
    }
}

async function connectSupabase(event) {
    if (event) event.preventDefault();
    const url = document.getElementById('db-url').value.trim();
    const key = document.getElementById('db-key').value.trim();
    
    if (!url || !key) {
        triggerToast('Please provide both URL and Anon Key.', 'error');
        return;
    }
    
    triggerToast('Connecting to Supabase database...', 'info');
    await initSupabase(url, key, true);
}

function disconnectSupabase() {
    localStorage.removeItem('7power_supabase_url');
    localStorage.removeItem('7power_supabase_key');
    
    const urlInput = document.getElementById('db-url');
    const keyInput = document.getElementById('db-key');
    if (urlInput) urlInput.value = '';
    if (keyInput) keyInput.value = '';
    
    dbClient = null;
    dbConfig.connected = false;
    dbConfig.url = '';
    dbConfig.key = '';
    
    updateDbStatus(false);
    triggerToast('Disconnected. Reverted back to Local Storage.', 'info');
    
    loadStateFromStorage();
    renderAll();
}

async function syncFromSupabase() {
    if (!dbConfig.connected || !dbClient) return;
    
    try {
        // 1. Fetch shifts
        const { data: shiftsData, error: shiftsError } = await dbClient
            .from('gym_shifts')
            .select('*');
        if (shiftsError) throw shiftsError;
        
        if (shiftsData && shiftsData.length > 0) {
            shiftsData.forEach(row => {
                if (state.shifts[row.key]) {
                    state.shifts[row.key].current = row.current;
                    state.shifts[row.key].capacity = row.capacity;
                    state.shifts[row.key].label = row.label;
                    state.shifts[row.key].hours = row.hours;
                }
            });
        }
        
        // 2. Fetch products
        const { data: productsData, error: productsError } = await dbClient
            .from('gym_products')
            .select('*');
        if (productsError) throw productsError;
        
        if (productsData && productsData.length > 0) {
            productsData.forEach(row => {
                if (state.products[row.code]) {
                    state.products[row.code].name = row.name;
                    state.products[row.code].price = parseFloat(row.price);
                    state.products[row.code].category = row.category;
                    state.products[row.code].stock = row.stock;
                    state.products[row.code].desc = row.description || row.desc;
                    state.products[row.code].image = row.image;
                }
            });
        }
        
        // 3. Fetch ledger
        const { data: ledgerData, error: ledgerError } = await dbClient
            .from('gym_ledger')
            .select('*')
            .order('created_at', { ascending: false });
        if (ledgerError) throw ledgerError;
        
        if (ledgerData) {
            state.ledger = ledgerData.map(row => ({
                id: row.id,
                type: row.type,
                amount: parseFloat(row.amount),
                desc: row.description,
                senderPhone: row.sender_phone,
                refNo: row.ref_no,
                status: row.status,
                items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
                timestamp: row.created_at
            }));
        }
        
        // 4. Fetch settings
        const { data: settingsData, error: settingsError } = await dbClient
            .from('gym_settings')
            .select('*');
        if (settingsError) throw settingsError;
        
        if (settingsData) {
            settingsData.forEach(row => {
                if (row.key === 'theme') {
                    state.theme = row.value.theme;
                } else if (row.key === 'subscription') {
                    state.subscription = row.value;
                } else if (row.key === 'flashSaleSeconds') {
                    state.flashSaleSeconds = row.value.flashSaleSeconds;
                }
            });
        }
        
        renderAll();
        setupTheme();
        
    } catch (e) {
        console.error('Error syncing from Supabase:', e);
        triggerToast('Failed to fetch some data from Supabase.', 'error');
    }
}

async function updateSupabaseSetting(key, value) {
    if (!dbConfig.connected || !dbClient) return;
    try {
        const { error } = await dbClient
            .from('gym_settings')
            .upsert({ key: key, value: value });
        if (error) throw error;
    } catch (e) {
        console.error(`Error updating setting ${key} in Supabase:`, e);
    }
}

async function updateSupabaseShift(key, current) {
    if (!dbConfig.connected || !dbClient) return;
    try {
        const { error } = await dbClient
            .from('gym_shifts')
            .update({ current: current })
            .eq('key', key);
        if (error) throw error;
    } catch (e) {
        console.error(`Error updating shift ${key} in Supabase:`, e);
    }
}

async function updateSupabaseProductStock(code, newStock) {
    if (!dbConfig.connected || !dbClient) return;
    try {
        const { error } = await dbClient
            .from('gym_products')
            .update({ stock: newStock })
            .eq('code', code);
        if (error) throw error;
    } catch (e) {
        console.error(`Error updating product stock for ${code} in Supabase:`, e);
    }
}

async function insertSupabaseTransaction(tx) {
    if (!dbConfig.connected || !dbClient) return;
    try {
        const { error } = await dbClient
            .from('gym_ledger')
            .insert({
                id: tx.id,
                type: tx.type,
                amount: tx.amount,
                description: tx.desc,
                sender_phone: tx.senderPhone,
                ref_no: tx.refNo,
                status: tx.status,
                items: tx.items,
                created_at: tx.timestamp
            });
        if (error) throw error;
    } catch (e) {
        console.error(`Error inserting transaction ${tx.id} in Supabase:`, e);
    }
}

async function updateSupabaseTransactionStatus(txId, status) {
    if (!dbConfig.connected || !dbClient) return;
    try {
        const { error } = await dbClient
            .from('gym_ledger')
            .update({ status: status })
            .eq('id', txId);
        if (error) throw error;
    } catch (e) {
        console.error(`Error updating transaction status for ${txId} in Supabase:`, e);
    }
}

async function syncAllDefaultsToSupabase() {
    if (!dbConfig.connected || !dbClient) return;
    try {
        // 1. Reset shifts
        for (const key of Object.keys(state.shifts)) {
            const shift = state.shifts[key];
            await dbClient.from('gym_shifts').upsert({
                key: key,
                label: shift.label,
                current: shift.current,
                capacity: shift.capacity,
                hours: shift.hours
            });
        }
        
        // 2. Reset products
        for (const code of Object.keys(state.products)) {
            const product = state.products[code];
            await dbClient.from('gym_products').upsert({
                code: code,
                name: product.name,
                price: product.price,
                category: product.category,
                stock: product.stock,
                description: product.desc,
                image: product.image
            });
        }
        
        // 3. Clear ledger
        await dbClient.from('gym_ledger').delete().neq('id', 'dummy');
        
        // 4. Settings
        await updateSupabaseSetting('theme', { theme: state.theme });
        await updateSupabaseSetting('subscription', state.subscription);
        await updateSupabaseSetting('flashSaleSeconds', { flashSaleSeconds: state.flashSaleSeconds });
        
        triggerToast('Supabase Database reset successfully.', 'success');
    } catch (e) {
        console.error('Error seeding defaults to Supabase:', e);
        triggerToast('Failed to reset all database default values.', 'error');
    }
}

// Toast alerts helper
function triggerToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-text">${message}</span>
    `;
    container.appendChild(toast);

    // Remove toast after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'toast-slide var(--transition-normal) forwards reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                container.removeChild(toast);
            }
        }, 300);
    }, 4000);
}
