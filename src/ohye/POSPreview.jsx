import React, { useState, useMemo, useEffect } from "react";
import {
  listMenu, saveMenuItem, deleteMenuItem, uploadMenuPhoto,
  listBundles, saveBundle as apiSaveBundle, deleteBundle as apiDeleteBundle,
  listOrders, createOrder, refundOrder as apiRefundOrder,
  getSettings, saveSettings, nextOrderSeq,
} from "../storage/ohyeApi.js";

/**
 * POS LAYOUT PREVIEW — Malaysia F&B (takeaway only)
 * ----------------------------------------------------------------
 * LAYOUT PREVIEW, not the final build.
 *
 * Scope locked so far:
 *  - Takeaway only — no dine-in, no table number, no order type on receipts.
 *  - Thermal printer: USB direct (WebUSB) for both receipt and label
 *    printers — no OS print dialog, no Bluetooth.
 *  - Compliance: SST-compliant receipt (toggle; off by default), not full MyInvois
 *  - No service charge.
 *  - Ice level + a free-text note per cart line (e.g. "no onion", "extra spicy").
 *    The drink label sticker doubles as the kitchen order — no separate
 *    kitchen ticket — so labels print ice level and the note too.
 *  - Backoffice: add/edit/delete menu items, mark sold out, manage bundle sets —
 *    gated behind a manager password except marking sold out.
 *  - Checkout: Cash, QR, or Split (part cash + part QR). Cash applies
 *    Malaysia's 5-sen rounding (BNM rounding mechanism) and shows change.
 *    Split assumes the cashier enters exact amounts per method — no
 *    tendered/change handling on the cash leg of a split (flag if you
 *    need "customer pays RM50 cash toward a split and needs change back").
 *  - Cancel order (pre-payment, no password) and park/resume an order.
 *  - Cashier daily closing (Z-report) and backoffice reports (totals,
 *    sales by product, order list by period).
 *  - Refund a completed order from backoffice reports — password gated,
 *    excluded from sales totals but kept visible for the audit trail.
 *  - Last completed order stays viewable (receipt/label) after starting
 *    the next order, so it can be reprinted.
 *
 * IMPORTANT — password handling in this preview is a MOCK: a single
 * plain-text manager/discount password lives in component state just to
 * demonstrate the gate flow. Real build must verify per-staff PINs against
 * a backend (hashed), with an audit log of who did what and when.
 *
 * IMPORTANT — order history lives in React state only and resets on
 * reload. Real build needs a database so reports/closing/refunds survive
 * refreshes and work across devices.
 */

// ---- Mock menu data -------------------------------------------------
const CATEGORIES = ["Food", "Drinks"];

const DEFAULT_MENU = [
  { id: "c1", cat: "Drinks", name: "Kopi O", price: 3.0, hasCustom: true, soldOut: false, variations: [] },
  { id: "c2", cat: "Drinks", name: "Kopi C Peng", price: 4.5, hasCustom: true, soldOut: false, variations: [] },
  { id: "c3", cat: "Drinks", name: "Latte", price: 7.0, hasCustom: true, soldOut: false, variations: [] },
  { id: "t1", cat: "Drinks", name: "Teh Tarik", price: 3.5, hasCustom: true, soldOut: false, variations: [] },
  { id: "t2", cat: "Drinks", name: "Teh O Ais Limau", price: 4.0, hasCustom: true, soldOut: false, variations: [] },
  { id: "j1", cat: "Drinks", name: "Fresh Orange", price: 5.5, hasCustom: true, soldOut: false, variations: [] },
  { id: "j2", cat: "Drinks", name: "Sirap Bandung", price: 3.5, hasCustom: true, soldOut: false, variations: [] },
  { id: "f1", cat: "Food", name: "Nasi Lemak", price: 8.0, hasCustom: false, soldOut: false, variations: [{ id: "f1-lg", name: "Large", price: 10.0 }] },
  { id: "f2", cat: "Food", name: "Roti Canai", price: 2.5, hasCustom: false, soldOut: false, variations: [] },
  { id: "f3", cat: "Food", name: "Mee Goreng", price: 7.5, hasCustom: false, soldOut: false, variations: [] },
];

const DEFAULT_BUNDLES = [{ id: "b1", name: "Breakfast Set", itemIds: ["f2", "c1"], price: 5.0 }];

const ICE_LEVELS = ["Normal ice", "Less ice", "No ice"];
const CASH_QUICK_AMOUNTS = [10, 20, 50, 100];

// ---- Helpers ----------------------------------------------------------
const fmt = (n) => `RM ${n.toFixed(2)}`;

function receiptNumber(seq) {
  return `INV-${String(seq).padStart(4, "0")}`;
}

function roundToNearest5Sen(amount) {
  return Math.round(amount * 20) / 20;
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function filterOrdersByPeriod(orders, period, customStart, customEnd) {
  const now = new Date();
  if (period === "today") return orders.filter((o) => isSameDay(o.time, now));
  if (period === "week") {
    const start = startOfWeek(now);
    return orders.filter((o) => o.time >= start);
  }
  if (period === "month") {
    return orders.filter((o) => o.time.getMonth() === now.getMonth() && o.time.getFullYear() === now.getFullYear());
  }
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return orders.filter((o) => o.time >= start && o.time <= end);
  }
  return orders; // all time
}

// Payment amount actually collected via cash, for a given order (any method)
function cashPortion(o) {
  if (o.paymentMethod === "cash") return o.amountCollected;
  if (o.paymentMethod === "split") return o.splitCash || 0;
  return 0;
}
function qrPortion(o) {
  if (o.paymentMethod === "qr") return o.amountCollected;
  if (o.paymentMethod === "split") return o.splitQr || 0;
  return 0;
}

function summarize(orders) {
  const active = orders.filter((o) => !o.refunded);
  const refunded = orders.filter((o) => o.refunded);
  const totalOrders = active.length;
  const gross = active.reduce((s, o) => s + o.subtotal, 0);
  const discounts = active.reduce((s, o) => s + (o.discountAmount || 0), 0);
  const sst = active.reduce((s, o) => s + o.sst, 0);
  const net = active.reduce((s, o) => s + o.total, 0);
  const cash = active.reduce((s, o) => s + cashPortion(o), 0);
  const qr = active.reduce((s, o) => s + qrPortion(o), 0);
  const rounding = active.reduce((s, o) => s + (o.roundingAdjustment || 0), 0);
  const refundCount = refunded.length;
  const refundAmount = refunded.reduce((s, o) => s + o.amountCollected, 0);
  return { totalOrders, gross, discounts, sst, net, cash, qr, rounding, refundCount, refundAmount };
}

function salesByProduct(orders) {
  const map = new Map();
  orders
    .filter((o) => !o.refunded)
    .forEach((o) =>
      o.lines.forEach((l) => {
        const prev = map.get(l.name) || { name: l.name, qty: 0, amount: 0 };
        prev.qty += l.qty;
        prev.amount += l.price * l.qty;
        map.set(l.name, prev);
      })
    );
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

// ---- Printer connect (real calls, safe fallback) -----------------------
// Two of these run side by side — one for the receipt printer, one for the
// label printer. Both connect over USB only, the same way you'd plug two
// printers into a USB hub: the browser (and a real POS app) can hold both
// device handles at once, independently.
//
// DEFAULT PRINTER PER ROLE: whichever device you connect for a role becomes
// that role's remembered default (deviceId below). The browser itself
// remembers you've authorized that exact USB device — navigator.usb
// .getDevices() lists previously-authorized devices without prompting the
// user again, which is what lets a POS app silently reconnect to "the
// receipt printer" on next launch instead of asking every time.
//
// PERSISTENCE NOTE: to survive a page reload, the app needs to remember
// *which* device id belongs to *which* role — e.g.
// localStorage.setItem(`pos.defaultPrinter.${role}`, deviceId). That call
// is deliberately left as a comment below rather than wired in, because
// this file previews inside Claude's sandbox, which blocks browser storage
// APIs. In your real deployed app (outside this preview) you can use
// localStorage, or better, save it against the till/register in your
// backend so it's consistent across restarts and devices.
function usePrinterConnection(role) {
  const [status, setStatus] = useState("Not connected");
  const [connected, setConnected] = useState(false);
  const [baseStatus, setBaseStatus] = useState("Not connected");
  const [deviceName, setDeviceName] = useState(null);
  const [deviceId, setDeviceId] = useState(null); // vendorId:productId:serialNumber

  const connectUsb = async () => {
    setStatus("Requesting USB device…");
    try {
      if (!navigator.usb) throw new Error("WebUSB not available in this environment");
      const device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      const name = device.productName || "USB printer";
      const id = `${device.vendorId}:${device.productId}:${device.serialNumber || ""}`;
      setDeviceName(name);
      setDeviceId(id);
      // localStorage.setItem(`pos.defaultPrinter.${role}`, id); // real build only
      const s = `Connected: ${name} (default)`;
      setConnected(true);
      setStatus(s);
      setBaseStatus(s);
    } catch (e) {
      const s = `Not connected — ${e.message}`;
      setConnected(false);
      setStatus(s);
      setBaseStatus(s);
    }
  };

  // Silent reconnect to the remembered default — no device picker, no user
  // gesture required, because navigator.usb.getDevices() only returns
  // devices the browser already trusts. Call this once on app start (after
  // reading the saved deviceId from storage in the real build) so the
  // cashier doesn't have to re-pick "the receipt printer" every shift.
  const reconnectDefault = async () => {
    if (!navigator.usb || !deviceId) return false;
    const devices = await navigator.usb.getDevices();
    const match = devices.find((d) => `${d.vendorId}:${d.productId}:${d.serialNumber || ""}` === deviceId);
    if (!match) return false;
    await match.open();
    const s = `Connected: ${match.productName || deviceName} (default)`;
    setConnected(true);
    setStatus(s);
    setBaseStatus(s);
    return true;
  };

  // Real build: send the ESC/POS drawer-kick pulse over the same transport
  // used for printing. Here we just show it happened.
  const kickDrawer = () => {
    setStatus("Cash drawer opened");
    setTimeout(() => setStatus(baseStatus), 1800);
  };

  // Real build: encode the job as ESC/POS bytes and write them to the open
  // USB transport. Here we just simulate the round trip so the
  // auto-print-on-payment flow and manual reprint buttons have something
  // to call. Returns whether the job could be sent.
  const print = (jobLabel) => {
    if (!connected) {
      setStatus(`Not connected — couldn't print ${jobLabel}`);
      return false;
    }
    setStatus(`Printing ${jobLabel}…`);
    setTimeout(() => setStatus(`Printed ${jobLabel}`), 900);
    setTimeout(() => setStatus(baseStatus), 2400);
    return true;
  };

  // On mount, try to silently reconnect to this role's default — a no-op
  // in this preview since nothing was persisted yet this session, but this
  // is exactly where it fires once the real build reads a saved deviceId
  // from storage before this effect runs.
  useEffect(() => {
    reconnectDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { role, status, connected, deviceName, connectUsb, reconnectDefault, kickDrawer, print };
}

// ---- Main component -----------------------------------------------------
export default function POSPreview({ isAdmin: isLoggedInAdmin }) {
  const [view, setView] = useState("order"); // order | receipt | label | settings | backoffice | daily-closing
  const [loading, setLoading] = useState(true);
  const [menu, setMenuState] = useState([]);
  const [bundles, setBundlesState] = useState([]);
  const [activeCat, setActiveCat] = useState(CATEGORIES[0]);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(null); // { type: 'percent'|'amount', value }
  const [customizeItem, setCustomizeItem] = useState(null);
  const [noteLineId, setNoteLineId] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showParked, setShowParked] = useState(false);
  const [parkedOrders, setParkedOrders] = useState([]);
  const [orders, setOrders] = useState([]); // completed order history — real, persisted history now
  const [lastOrder, setLastOrder] = useState(null);
  const [labelIndex, setLabelIndex] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Password gate — one pending action at a time
  const [pendingAction, setPendingAction] = useState(null); // { title, expected, onSuccess }
  const requestPassword = (title, expected, onSuccess) => setPendingAction({ title, expected, onSuccess });

  // Business settings — real, persisted (single row in ohye_settings),
  // not local-only anymore. Loaded on mount below; this is just what shows
  // for the brief moment before that load completes.
  const [biz, setBiz] = useState({
    name: "OHYE!",
    ssm: "",
    address: "",
    sstRegistered: false,
    sstNo: "",
    sstRate: 6,
    managerPassword: "1234",
    discountPassword: "1234",
    autoPrintReceipt: true,
    autoPrintLabels: true,
  });

  // Initial load — menu, bundles, settings, and full order history, all
  // from the real backend now instead of in-memory defaults. Runs once on
  // mount; each screen (order taking, backoffice, reports) just reads from
  // this same state afterward, same as the original preview did.
  useEffect(() => {
    (async () => {
      const [menuRows, bundleRows, settings, orderRows] = await Promise.all([
        listMenu(), listBundles(), getSettings(), listOrders(),
      ]);
      setMenuState(menuRows);
      setBundlesState(bundleRows);
      if (settings) setBiz(settings);
      setOrders(orderRows);
      setLoading(false);
    })();
  }, []);

  // Wrapped setters — every existing call site elsewhere in this file
  // (MenuManagement, BundleEditModal, etc.) already calls setMenu/
  // setBundles/setBiz exactly the way React's own setState works
  // (setMenu(nextValue) or setMenu(prev => next)), so those call sites
  // don't need to change at all. These wrappers intercept that same call,
  // diff old vs new to work out what actually changed, persist just that
  // difference, and then update local state — the same as before, just
  // with the backend kept in sync alongside it.
  const setMenu = (updater) => {
    setMenuState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set(prev.map((m) => m.id));
      const nextIds = new Set(next.map((m) => m.id));
      prev.forEach((old) => { if (!nextIds.has(old.id)) deleteMenuItem(old.id); });
      next.forEach((item) => {
        const old = prev.find((m) => m.id === item.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(item)) saveMenuItem(item);
      });
      return next;
    });
  };
  const setBundles = (updater) => {
    setBundlesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set(prev.map((b) => b.id));
      const nextIds = new Set(next.map((b) => b.id));
      prev.forEach((old) => { if (!nextIds.has(old.id)) apiDeleteBundle(old.id); });
      next.forEach((b) => {
        const old = prev.find((x) => x.id === b.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(b)) apiSaveBundle(b);
      });
      return next;
    });
  };
  const setBizPersisted = (nextBiz) => {
    setBiz(nextBiz);
    saveSettings(nextBiz);
  };

  const receiptPrinter = usePrinterConnection("receipt");
  const labelPrinter = usePrinterConnection("label");

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const discountAmount = useMemo(() => {
    if (!discount) return 0;
    const raw = discount.type === "percent" ? subtotal * (discount.value / 100) : discount.value;
    return Math.min(Math.max(raw, 0), subtotal);
  }, [discount, subtotal]);
  const taxable = subtotal - discountAmount;
  const sst = biz.sstRegistered ? taxable * (biz.sstRate / 100) : 0;
  const total = taxable + sst;

  const addToCart = (item, custom) => {
    setCart((c) => [
      ...c,
      {
        lineId: `${item.id}-${Date.now()}`,
        id: item.id,
        name: item.name,
        price: custom?.variation ? custom.variation.price : item.price,
        variation: custom?.variation ? custom.variation.name : null,
        qty: 1,
        ice: custom?.ice || null,
        note: null,
        isBundle: !!item.isBundle,
      },
    ]);
  };

  const removeLine = (lineId) => setCart((c) => c.filter((l) => l.lineId !== lineId));
  const changeQty = (lineId, delta) =>
    setCart((c) =>
      c.map((l) => (l.lineId === lineId ? { ...l, qty: Math.max(1, l.qty + delta) } : l)).filter((l) => l.qty > 0)
    );
  const updateLineNote = (lineId, note) => setCart((c) => c.map((l) => (l.lineId === lineId ? { ...l, note: note || null } : l)));

  const cancelOrder = () => {
    if (!cart.length) return;
    if (window.confirm("Cancel this order? All items will be cleared.")) {
      setCart([]);
      setDiscount(null);
    }
  };

  const parkOrder = (note) => {
    if (!cart.length) return;
    setParkedOrders((p) => [...p, { id: `park-${Date.now()}`, note, cart, discount, parkedAt: new Date() }]);
    setCart([]);
    setDiscount(null);
  };

  const resumeParked = (ticket) => {
    if (cart.length) {
      alert("Finish, cancel, or park the current order first.");
      return;
    }
    setCart(ticket.cart);
    setDiscount(ticket.discount);
    setParkedOrders((p) => p.filter((t) => t.id !== ticket.id));
    setShowParked(false);
  };

  const discardParked = (id) => setParkedOrders((p) => p.filter((t) => t.id !== id));

  const completeOrder = async (payment) => {
    if (cart.length === 0 || completing) return;
    setCompleting(true);
    const seq = await nextOrderSeq();
    if (seq === null) {
      alert("Couldn't reach the server to get the next receipt number — check your connection and try again.");
      setCompleting(false);
      return;
    }
    const num = receiptNumber(seq);
    const order = {
      number: num,
      time: new Date(),
      lines: cart,
      subtotal,
      discount,
      discountAmount,
      sst,
      total,
      amountCollected: payment.amountCollected,
      roundingAdjustment: payment.roundingAdjustment || 0,
      paymentMethod: payment.method,
      cashReceived: payment.cashReceived || null,
      changeGiven: payment.changeGiven || null,
      splitCash: payment.splitCash || null,
      splitQr: payment.splitQr || null,
      refunded: false,
    };
    const result = await createOrder(order);
    if (!result.ok) {
      alert("This order didn't save — please check your connection and try again before printing anything.");
      setCompleting(false);
      return;
    }
    // Reflect the same stock decrement the server just did, locally and
    // immediately, rather than waiting on a full menu refetch — matches
    // decrementStockForSale's own logic in ohyeApi.js exactly.
    const soldQtyById = {};
    cart.forEach((l) => { soldQtyById[l.id] = (soldQtyById[l.id] || 0) + l.qty; });
    setMenuState((prev) => prev.map((it) => {
      if (!it.trackStock || !soldQtyById[it.id]) return it;
      const nextQty = Math.max(0, it.stockQty - soldQtyById[it.id]);
      return { ...it, stockQty: nextQty, soldOut: nextQty <= 0 };
    }));
    setLastOrder(order);
    setOrders((o) => [...o, order]);
    if (payment.method === "cash" || (payment.method === "split" && payment.splitCash > 0)) receiptPrinter.kickDrawer();
    if (biz.autoPrintReceipt) receiptPrinter.print(`receipt ${num}`);
    if (biz.autoPrintLabels) labelPrinter.print(`${cart.length} label${cart.length > 1 ? "s" : ""}`);
    setLabelIndex(0);
    setShowPayment(false);
    setView("receipt");
    setCompleting(false);
  };

  const startNewOrder = () => {
    setCart([]);
    setDiscount(null);
    setView("order");
    // lastOrder intentionally kept — Receipt/Label tabs stay reprintable
    // until the next order completes and replaces it.
  };

  const refundOrder = async (order) => {
    const result = await apiRefundOrder(order.number);
    if (!result.ok) { alert("Refund didn't save — please check your connection and try again."); return; }
    setOrders((os) => os.map((o) => (o.number === order.number ? { ...o, refunded: true, refundedAt: new Date() } : o)));
  };

  if (loading) {
    return (
      <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 13, color: "#888780" }}>Loading OHYE! POS…</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <Header view={view} setView={setView} receiptPrinter={receiptPrinter} labelPrinter={labelPrinter} cartCount={cart.length} bizName={biz.name} />

      {view === "order" && (
        <OrderScreen
          menu={menu}
          bundles={bundles}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          cart={cart}
          subtotal={subtotal}
          discount={discount}
          discountAmount={discountAmount}
          sst={sst}
          total={total}
          sstRegistered={biz.sstRegistered}
          onItemTap={(item) => (item.hasCustom || item.variations?.length > 0 ? setCustomizeItem(item) : addToCart(item))}
          onBundleTap={(bundle) => addToCart({ id: bundle.id, name: bundle.name, price: bundle.price, isBundle: true })}
          removeLine={removeLine}
          changeQty={changeQty}
          onEditNote={(lineId) => setNoteLineId(lineId)}
          onCheckout={() => setShowPayment(true)}
          onCancelOrder={cancelOrder}
          onParkOrder={parkOrder}
          parkedCount={parkedOrders.length}
          onShowParked={() => setShowParked(true)}
          onRequestDiscount={() => setPendingAction({ type: "discount-form" })}
          onRemoveDiscount={() => setDiscount(null)}
        />
      )}

      {view === "receipt" && lastOrder && (
        <ReceiptScreen biz={biz} order={lastOrder} printer={receiptPrinter} onNewOrder={startNewOrder} onViewLabels={() => setView("label")} />
      )}

      {view === "label" && lastOrder && <LabelScreen order={lastOrder} printer={labelPrinter} index={labelIndex} setIndex={setLabelIndex} onDone={startNewOrder} />}

      {view === "settings" && <SettingsScreen biz={biz} setBiz={setBizPersisted} onClose={() => setView("order")} />}

      {view === "backoffice" && (
        <BackofficeScreen
          menu={menu}
          setMenu={setMenu}
          bundles={bundles}
          setBundles={setBundles}
          orders={orders}
          managerPassword={biz.managerPassword}
          requestPassword={requestPassword}
          isLoggedInAdmin={isLoggedInAdmin}
          onRefund={refundOrder}
          onClose={() => setView("order")}
        />
      )}

      {view === "daily-closing" && <DailyClosingScreen orders={orders} onClose={() => setView("order")} />}

      {customizeItem && (
        <CustomizeModal
          item={customizeItem}
          onCancel={() => setCustomizeItem(null)}
          onConfirm={(custom) => {
            addToCart(customizeItem, custom);
            setCustomizeItem(null);
          }}
        />
      )}

      {noteLineId && (
        <NoteModal
          currentNote={cart.find((l) => l.lineId === noteLineId)?.note || ""}
          onCancel={() => setNoteLineId(null)}
          onSave={(note) => {
            updateLineNote(noteLineId, note);
            setNoteLineId(null);
          }}
        />
      )}

      {showPayment && <PaymentModal total={total} completing={completing} onCancel={() => setShowPayment(false)} onConfirm={completeOrder} />}

      {showParked && <ParkedOrdersModal parked={parkedOrders} onResume={resumeParked} onDiscard={discardParked} onClose={() => setShowParked(false)} />}

      {pendingAction?.type === "discount-form" && (
        <DiscountFormModal
          onCancel={() => setPendingAction(null)}
          onSubmit={(type, value) => {
            requestPassword("Manager approval — apply discount", biz.discountPassword, () => setDiscount({ type, value }));
          }}
        />
      )}

      {pendingAction && pendingAction.type !== "discount-form" && (
        <PasswordModal
          title={pendingAction.title}
          expected={pendingAction.expected}
          onCancel={() => setPendingAction(null)}
          onSuccess={() => {
            pendingAction.onSuccess();
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}

// ---- Header / nav ---------------------------------------------------------
function Header({ view, setView, receiptPrinter, labelPrinter, cartCount, bizName }) {
  return (
    <div style={styles.header}>
      <div style={styles.headerTop}>
        <div style={styles.brandMark}>
          <div style={styles.brandDot} />
          <span style={styles.brandName}>{bizName}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={styles.iconBtn} onClick={() => setView("daily-closing")} title="Daily closing">
            🧾
          </button>
          <button style={styles.iconBtn} onClick={() => setView("backoffice")} title="Manage menu & reports">
            ☰
          </button>
          <button style={styles.iconBtn} onClick={() => setView("settings")} title="Settings">
            ⚙
          </button>
        </div>
      </div>

      <div style={styles.printerRow}>
        <span style={styles.printerRoleLabel}>Receipt</span>
        <span style={{ ...styles.printerDot, background: receiptPrinter.connected ? "#0F6E56" : "#B4B2A9" }} />
        <span style={styles.printerStatus}>{receiptPrinter.status}</span>
        <div style={{ flex: 1 }} />
        <button style={styles.smallBtn} onClick={receiptPrinter.connectUsb}>
          Connect USB
        </button>
      </div>
      <div style={styles.printerRow}>
        <span style={styles.printerRoleLabel}>Label</span>
        <span style={{ ...styles.printerDot, background: labelPrinter.connected ? "#0F6E56" : "#B4B2A9" }} />
        <span style={styles.printerStatus}>{labelPrinter.status}</span>
        <div style={{ flex: 1 }} />
        <button style={styles.smallBtn} onClick={labelPrinter.connectUsb}>
          Connect USB
        </button>
      </div>

      <div style={styles.tabRow}>
        {[
          ["order", `Order${cartCount ? ` (${cartCount})` : ""}`],
          ["receipt", "Receipt preview"],
          ["label", "Label preview"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{ ...styles.tab, ...(view === key ? styles.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Order screen -----------------------------------------------------------
// Full screen means this needs to actually make use of a wide viewport,
// not just stretch the original phone-frame layout — on a tablet/desktop
// width, the cart becomes a proper side panel next to the menu grid
// instead of a thin strip stacked underneath it. Below the 900px
// breakpoint (a phone held portrait, roughly), it stays exactly as
// originally designed: menu on top, cart below.
function useIsWide() {
  const [isWide, setIsWide] = useState(typeof window !== "undefined" ? window.innerWidth >= 900 : false);
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isWide;
}

function OrderScreen({
  menu,
  bundles,
  activeCat,
  setActiveCat,
  cart,
  subtotal,
  discount,
  discountAmount,
  sst,
  total,
  sstRegistered,
  onItemTap,
  onBundleTap,
  removeLine,
  changeQty,
  onEditNote,
  onCheckout,
  onCancelOrder,
  onParkOrder,
  parkedCount,
  onShowParked,
  onRequestDiscount,
  onRemoveDiscount,
}) {
  const showingBundles = activeCat === "Bundles";
  const [showParkNote, setShowParkNote] = useState(false);

  const isWide = useIsWide();

  return (
    <div style={{ display: "flex", flexDirection: isWide ? "row" : "column", alignItems: "stretch" }}>
      <div style={{ ...styles.orderLayout, flex: isWide ? 1 : "none", minWidth: 0 }}>
      <div style={styles.catRow}>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setActiveCat(c)} style={{ ...styles.catBtn, ...(activeCat === c ? styles.catBtnActive : {}) }}>
            {c}
          </button>
        ))}
        {bundles.length > 0 && (
          <button onClick={() => setActiveCat("Bundles")} style={{ ...styles.catBtn, ...(activeCat === "Bundles" ? styles.catBtnActive : {}) }}>
            Bundles
          </button>
        )}
        {parkedCount > 0 && (
          <button style={styles.parkedChip} onClick={onShowParked}>
            Parked ({parkedCount})
          </button>
        )}
      </div>

      <div style={styles.menuGrid}>
        {!showingBundles &&
          menu
            .filter((m) => m.cat === activeCat)
            .map((item) => (
              <button
                key={item.id}
                style={{ ...styles.menuCard, ...(item.photoUrl ? styles.menuCardWithPhoto : {}), ...(item.soldOut ? styles.menuCardSoldOut : {}) }}
                onClick={() => !item.soldOut && onItemTap(item)}
                disabled={item.soldOut}
              >
                {item.photoUrl && <img src={item.photoUrl} alt={item.name} style={styles.menuCardPhoto} />}
                <div style={item.photoUrl ? styles.menuCardBody : undefined}>
                  <div style={styles.menuCardName}>{item.name}</div>
                  {item.soldOut ? (
                    <div style={styles.soldOutBadge}>Sold out</div>
                  ) : (
                    <div style={styles.menuCardPrice}>
                      {item.variations?.length > 0 ? `From ${fmt(Math.min(item.price, ...item.variations.map((v) => v.price)))}` : fmt(item.price)}
                    </div>
                  )}
                </div>
              </button>
            ))}

        {showingBundles &&
          bundles.map((b) => (
            <button key={b.id} style={styles.menuCard} onClick={() => onBundleTap(b)}>
              <div style={styles.menuCardName}>{b.name}</div>
              <div style={styles.menuCardPrice}>{fmt(b.price)}</div>
            </button>
          ))}
      </div>
      </div>

      <div style={{ ...styles.cartPanel, ...(isWide ? { width: 380, flexShrink: 0, borderTop: "none", borderLeft: `1px solid ${line}` } : {}) }}>
        <div style={styles.cartHeaderRow}>
          <div style={styles.cartHeader}>Current order</div>
          {cart.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              <button style={styles.textLinkBtn} onClick={() => setShowParkNote(true)}>
                Park
              </button>
              <button style={styles.textLinkBtnDanger} onClick={onCancelOrder}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <div style={styles.cartList}>
          {cart.length === 0 && <div style={styles.cartEmpty}>No items yet — tap a menu item to add.</div>}
          {cart.map((l) => (
            <div key={l.lineId} style={styles.cartLine}>
              <div style={{ flex: 1 }}>
                <div style={styles.cartLineName}>
                  {l.isBundle && <span style={styles.bundleTag}>Set</span>} {l.name}
                </div>
                {l.variation && <div style={styles.cartLineMeta}>{l.variation}</div>}
                {l.ice && <div style={styles.cartLineMeta}>{l.ice}</div>}
                {l.note ? (
                  <button style={styles.noteEditBtn} onClick={() => onEditNote(l.lineId)}>
                    Note: {l.note}
                  </button>
                ) : (
                  <button style={styles.noteAddBtn} onClick={() => onEditNote(l.lineId)}>
                    + Note
                  </button>
                )}
              </div>
              <div style={styles.qtyControl}>
                <button style={styles.qtyBtn} onClick={() => changeQty(l.lineId, -1)}>
                  −
                </button>
                <span style={styles.qtyVal}>{l.qty}</span>
                <button style={styles.qtyBtn} onClick={() => changeQty(l.lineId, 1)}>
                  +
                </button>
              </div>
              <div style={styles.cartLinePrice}>{fmt(l.price * l.qty)}</div>
              <button style={styles.removeBtn} onClick={() => removeLine(l.lineId)}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={styles.cartTotals}>
          <div style={styles.totalRow}>
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {discount ? (
            <div style={styles.totalRow}>
              <span>
                Discount ({discount.type === "percent" ? `${discount.value}%` : "fixed"})
                <button style={styles.discountRemoveBtn} onClick={onRemoveDiscount}>
                  remove
                </button>
              </span>
              <span>-{fmt(discountAmount)}</span>
            </div>
          ) : (
            <button style={styles.addDiscountBtn} onClick={onRequestDiscount} disabled={!cart.length}>
              + Add discount
            </button>
          )}
          {sstRegistered && (
            <div style={styles.totalRow}>
              <span>SST (6%)</span>
              <span>{fmt(sst)}</span>
            </div>
          )}
          <div style={{ ...styles.totalRow, ...styles.totalRowGrand }}>
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>

        <button style={{ ...styles.checkoutBtn, opacity: cart.length ? 1 : 0.5 }} disabled={!cart.length} onClick={onCheckout}>
          Choose payment & print
        </button>
      </div>

      {showParkNote && (
        <ParkNoteModal
          onCancel={() => setShowParkNote(false)}
          onConfirm={(note) => {
            onParkOrder(note);
            setShowParkNote(false);
          }}
        />
      )}
    </div>
  );
}

// ---- Per-item note modal ----------------------------------------------------
function NoteModal({ currentNote, onCancel, onSave }) {
  const [note, setNote] = useState(currentNote);
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTitle}>Item note</div>
        <div style={styles.modalLabel}>Shown on the drink label sticker (kitchen copy)</div>
        <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no onion, extra spicy" autoFocus />
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.modalConfirmBtn} onClick={() => onSave(note.trim())}>
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Park note modal --------------------------------------------------------
function ParkNoteModal({ onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTitle}>Park this order</div>
        <div style={styles.modalLabel}>Note (optional) — e.g. customer name or reason</div>
        <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. still deciding drinks" autoFocus />
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.modalConfirmBtn} onClick={() => onConfirm(note)}>
            Park order
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Parked orders modal ----------------------------------------------------
function ParkedOrdersModal({ parked, onResume, onDiscard, onClose }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalCard, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={styles.modalTitle}>Parked orders</div>
        {parked.length === 0 && <div style={styles.cartEmpty}>Nothing parked.</div>}
        {parked.map((t) => (
          <div key={t.id} style={styles.backofficeRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.backofficeItemName}>{t.note || "No note"}</div>
              <div style={styles.backofficeItemMeta}>
                {t.cart.length} item{t.cart.length > 1 ? "s" : ""} · {t.parkedAt.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <button style={styles.smallBtn} onClick={() => onResume(t)}>
              Resume
            </button>
            <button style={styles.removeBtn} onClick={() => onDiscard(t.id)}>
              ✕
            </button>
          </div>
        ))}
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Customize modal (ice) ---------------------------------------------
function CustomizeModal({ item, onCancel, onConfirm }) {
  const options = [{ name: "Regular", price: item.price }, ...(item.variations || [])];
  const [variation, setVariation] = useState(options[0]);
  const [ice, setIce] = useState(ICE_LEVELS[0]);
  const hasVariations = (item.variations || []).length > 0;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTitle}>{item.name}</div>
        <div style={styles.modalPrice}>{fmt(variation.price)}</div>

        {hasVariations && (
          <>
            <div style={styles.modalLabel}>Size / variation</div>
            <div style={styles.pillRow}>
              {options.map((v) => (
                <button
                  key={v.name}
                  onClick={() => setVariation(v)}
                  style={{ ...styles.pill, ...(variation.name === v.name ? styles.pillActive : {}) }}
                >
                  {v.name} ({fmt(v.price)})
                </button>
              ))}
            </div>
          </>
        )}

        {item.hasCustom && (
          <>
            <div style={styles.modalLabel}>Ice level</div>
            <div style={styles.pillRow}>
              {ICE_LEVELS.map((i) => (
                <button key={i} onClick={() => setIce(i)} style={{ ...styles.pill, ...(ice === i ? styles.pillActive : {}) }}>
                  {i}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={styles.modalConfirmBtn}
            onClick={() => onConfirm({ ice: item.hasCustom ? ice : null, variation: variation.name === "Regular" ? null : variation })}
          >
            Add to order
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Payment modal: Cash, QR, or Split ---------------------------------------
function PaymentModal({ total, completing, onCancel, onConfirm }) {
  const [method, setMethod] = useState(null); // 'cash' | 'qr' | 'split'
  const [tendered, setTendered] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitQr, setSplitQr] = useState("");
  const [error, setError] = useState("");

  const roundedTotal = roundToNearest5Sen(total);
  const roundingAdjustment = roundedTotal - total;
  const change = Math.max(0, (parseFloat(tendered) || 0) - roundedTotal);
  const enough = (parseFloat(tendered) || 0) >= roundedTotal;

  // completing guards all three confirm paths against a double-tap firing
  // two orders — completeOrder now makes a couple of sequential network
  // calls (reserve the receipt number, then save the order) before it's
  // actually done, unlike the original in-memory-only version which
  // finished instantly.
  const confirmCash = () => {
    if (completing) return;
    if (!enough) return setError("Amount received is less than the amount due");
    onConfirm({ method: "cash", amountCollected: roundedTotal, roundingAdjustment, cashReceived: parseFloat(tendered), changeGiven: change });
  };

  const confirmQr = () => { if (!completing) onConfirm({ method: "qr", amountCollected: total, roundingAdjustment: 0 }); };

  const setCashAndSyncQr = (v) => {
    setSplitCash(v);
    const c = parseFloat(v) || 0;
    setSplitQr(Math.max(0, total - c).toFixed(2));
  };
  const setQrAndSyncCash = (v) => {
    setSplitQr(v);
    const q = parseFloat(v) || 0;
    setSplitCash(Math.max(0, total - q).toFixed(2));
  };

  const confirmSplit = () => {
    if (completing) return;
    const c = parseFloat(splitCash) || 0;
    const q = parseFloat(splitQr) || 0;
    if (c <= 0 || q <= 0) return setError("Enter an amount for both cash and QR");
    if (Math.abs(c + q - total) > 0.01) return setError(`Cash + QR must add up to ${fmt(total)}`);
    onConfirm({ method: "split", amountCollected: total, roundingAdjustment: 0, splitCash: c, splitQr: q });
  };

  if (!method) {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalCard}>
          <div style={styles.modalTitle}>Payment method</div>
          <div style={styles.modalPrice}>Total due: {fmt(total)}</div>
          <div style={styles.paymentMethodGrid3}>
            <button style={styles.paymentMethodBtn} onClick={() => setMethod("cash")}>
              <div style={styles.paymentMethodLabel}>Cash</div>
            </button>
            <button style={styles.paymentMethodBtn} onClick={() => setMethod("qr")}>
              <div style={styles.paymentMethodLabel}>QR</div>
            </button>
            <button style={styles.paymentMethodBtn} onClick={() => setMethod("split")}>
              <div style={styles.paymentMethodLabel}>Split</div>
            </button>
          </div>
          <div style={styles.modalActions}>
            <button style={styles.modalCancelBtn} onClick={onCancel}>
              Back to order
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (method === "cash") {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalCard}>
          <div style={styles.modalTitle}>Cash payment</div>
          <div style={styles.modalPrice}>Total due: {fmt(total)}</div>
          {roundingAdjustment !== 0 && (
            <div style={styles.settingsHint}>
              Rounded to nearest 5 sen for cash: {roundingAdjustment > 0 ? "+" : ""}
              {fmt(roundingAdjustment)} → amount payable {fmt(roundedTotal)}
            </div>
          )}
          <div style={styles.modalLabel}>Amount received</div>
          <input
            style={styles.input}
            type="number"
            autoFocus
            placeholder="0.00"
            value={tendered}
            onChange={(e) => {
              setTendered(e.target.value);
              setError("");
            }}
          />
          <div style={styles.pillRow}>
            {CASH_QUICK_AMOUNTS.map((a) => (
              <button key={a} style={styles.pill} onClick={() => setTendered(String(a))}>
                RM {a}
              </button>
            ))}
            <button style={styles.pill} onClick={() => setTendered(roundedTotal.toFixed(2))}>
              Exact
            </button>
          </div>
          {tendered && (
            <div style={styles.changeRow}>
              <span>Balance to give back</span>
              <span style={styles.changeAmount}>{fmt(change)}</span>
            </div>
          )}
          {error && <div style={styles.errorText}>{error}</div>}
          <div style={styles.modalActions}>
            <button style={styles.modalCancelBtn} onClick={() => setMethod(null)}>
              Back
            </button>
            <button style={styles.modalConfirmBtn} onClick={confirmCash}>
              Confirm & print
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (method === "split") {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalCard}>
          <div style={styles.modalTitle}>Split payment</div>
          <div style={styles.modalPrice}>Total due: {fmt(total)}</div>
          <div style={styles.modalLabel}>Cash amount</div>
          <input style={styles.input} type="number" autoFocus placeholder="0.00" value={splitCash} onChange={(e) => setCashAndSyncQr(e.target.value)} />
          <div style={styles.modalLabel}>QR amount</div>
          <input style={styles.input} type="number" placeholder="0.00" value={splitQr} onChange={(e) => setQrAndSyncCash(e.target.value)} />
          <div style={styles.settingsHint}>Editing one field fills in the other so they add up to the total.</div>
          {error && <div style={styles.errorText}>{error}</div>}
          <div style={styles.modalActions}>
            <button style={styles.modalCancelBtn} onClick={() => setMethod(null)}>
              Back
            </button>
            <button style={styles.modalConfirmBtn} onClick={confirmSplit}>
              Confirm & print
            </button>
          </div>
        </div>
      </div>
    );
  }

  // QR
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTitle}>QR payment</div>
        <div style={styles.modalPrice}>Total due: {fmt(total)}</div>
        <div style={styles.qrPlaceholder}>
          <div style={styles.qrPlaceholderInner}>QR code</div>
        </div>
        <div style={styles.settingsHint}>Show this to the customer. Real build renders a live DuitNow QR and waits for the gateway to confirm, rather than a manual button.</div>
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={() => setMethod(null)}>
            Back
          </button>
          <button style={styles.modalConfirmBtn} onClick={confirmQr}>
            Payment received
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Discount form (cashier picks type/value, then password gate fires) -----
function DiscountFormModal({ onCancel, onSubmit }) {
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) return setError("Enter a discount value first");
    if (type === "percent" && n > 100) return setError("Percentage can't exceed 100");
    onSubmit(type, n);
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTitle}>Apply discount</div>
        <div style={styles.pillRow}>
          <button style={{ ...styles.pill, ...(type === "percent" ? styles.pillActive : {}) }} onClick={() => setType("percent")}>
            Percent %
          </button>
          <button style={{ ...styles.pill, ...(type === "amount" ? styles.pillActive : {}) }} onClick={() => setType("amount")}>
            Fixed RM
          </button>
        </div>
        <input
          style={{ ...styles.input, marginTop: 10 }}
          type="number"
          placeholder={type === "percent" ? "e.g. 10" : "e.g. 5.00"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
        />
        {error && <div style={styles.errorText}>{error}</div>}
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.modalConfirmBtn} onClick={submit}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Password gate modal ------------------------------------------------
function PasswordModal({ title, expected, onCancel, onSuccess }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!pw) return setError("Enter the password first");
    if (pw !== expected) return setError("Incorrect password");
    onSuccess();
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTitle}>{title}</div>
        <div style={styles.modalLabel}>Manager password required</div>
        <input
          style={styles.input}
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <div style={styles.errorText}>{error}</div>}
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.modalConfirmBtn} onClick={submit}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Receipt screen (80mm thermal paper simulation) ---------------------------
function ReceiptScreen({ biz, order, printer, onNewOrder, onViewLabels }) {
  return (
    <div style={styles.previewWrap}>
      {order.refunded && <div style={styles.refundedBanner}>REFUNDED</div>}
      <div style={styles.paperFrame}>
        <div style={styles.paper}>
          <div style={styles.recCenter}>{biz.name}</div>
          <div style={styles.recCenterSmall}>{biz.ssm}</div>
          <div style={styles.recCenterSmall}>{biz.address}</div>
          {biz.sstRegistered && <div style={styles.recCenterSmall}>SST No: {biz.sstNo}</div>}
          <div style={styles.recDivider} />

          <div style={styles.recRow}>
            <span>Receipt no.</span>
            <span>{order.number}</span>
          </div>
          <div style={styles.recRow}>
            <span>Date</span>
            <span>{order.time.toLocaleDateString("en-MY")}</span>
          </div>
          <div style={styles.recRow}>
            <span>Time</span>
            <span>{order.time.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div style={styles.recDivider} />

          {order.lines.map((l) => (
            <div key={l.lineId} style={{ marginBottom: 4 }}>
              <div style={styles.recRow}>
                <span>
                  {l.qty} x {l.name}
                  {l.isBundle ? " (set)" : ""}
                </span>
                <span>{fmt(l.price * l.qty)}</span>
              </div>
              {l.variation && <div style={styles.recSubLine}>{l.variation}</div>}
              {l.ice && <div style={styles.recSubLine}>{l.ice}</div>}
              {l.note && <div style={styles.recSubLine}>Note: {l.note}</div>}
            </div>
          ))}

          <div style={styles.recDivider} />
          <div style={styles.recRow}>
            <span>Subtotal</span>
            <span>{fmt(order.subtotal)}</span>
          </div>
          {order.discount && (
            <div style={styles.recRow}>
              <span>Discount {order.discount.type === "percent" ? `(${order.discount.value}%)` : ""}</span>
              <span>-{fmt(order.discountAmount)}</span>
            </div>
          )}
          {biz.sstRegistered && (
            <div style={styles.recRow}>
              <span>SST</span>
              <span>{fmt(order.sst)}</span>
            </div>
          )}
          <div style={styles.recDivider} />
          <div style={{ ...styles.recRow, fontWeight: 500, fontSize: 14 }}>
            <span>Total</span>
            <span>{fmt(order.total)}</span>
          </div>
          {order.roundingAdjustment !== 0 && (
            <div style={styles.recRow}>
              <span>Rounding</span>
              <span>
                {order.roundingAdjustment > 0 ? "+" : ""}
                {fmt(order.roundingAdjustment)}
              </span>
            </div>
          )}
          <div style={styles.recRow}>
            <span>Amount paid</span>
            <span>{fmt(order.amountCollected)}</span>
          </div>

          {order.paymentMethod === "split" ? (
            <>
              <div style={styles.recRow}>
                <span>Payment</span>
                <span>Split</span>
              </div>
              <div style={styles.recRow}>
                <span>Cash</span>
                <span>{fmt(order.splitCash)}</span>
              </div>
              <div style={styles.recRow}>
                <span>QR (DuitNow)</span>
                <span>{fmt(order.splitQr)}</span>
              </div>
            </>
          ) : (
            <div style={styles.recRow}>
              <span>Payment</span>
              <span>{order.paymentMethod === "cash" ? "Cash" : "QR (DuitNow)"}</span>
            </div>
          )}
          {order.paymentMethod === "cash" && (
            <>
              <div style={styles.recRow}>
                <span>Cash received</span>
                <span>{fmt(order.cashReceived)}</span>
              </div>
              <div style={styles.recRow}>
                <span>Change</span>
                <span>{fmt(order.changeGiven)}</span>
              </div>
            </>
          )}
          <div style={styles.recDivider} />
          <div style={styles.recCenterSmall}>Thank you, come again</div>
          <div style={styles.recCenterSmall}>This receipt is computer generated</div>
        </div>
      </div>

      <div style={styles.previewActions}>
        <button style={styles.secondaryActionBtn} onClick={() => printer.print(`receipt ${order.number}`)}>
          Print receipt
        </button>
        <button style={styles.secondaryActionBtn} onClick={onViewLabels}>
          View labels →
        </button>
      </div>
      <div style={{ ...styles.previewActions, marginTop: 8 }}>
        <button style={styles.primaryActionBtn} onClick={onNewOrder}>
          Start next order
        </button>
      </div>
      <div style={styles.previewNote}>Simulated 80mm paper. This screen stays reprintable until the next order completes.</div>
    </div>
  );
}

// ---- Label screen (drink sticker, ~50mm x 30mm — doubles as kitchen order) ----
function LabelScreen({ order, printer, index, setIndex, onDone }) {
  const lines = order.lines;
  const line = lines[index];
  if (!line) return null;

  return (
    <div style={styles.previewWrap}>
      <div style={styles.labelCounter}>
        Label {index + 1} of {lines.length}
      </div>
      <div style={styles.labelFrame}>
        <div style={styles.label}>
          <div style={styles.labelName}>{line.name}</div>
          {line.variation && <div style={styles.labelCustom}>{line.variation}</div>}
          {line.ice && <div style={styles.labelCustom}>{line.ice}</div>}
          {line.note && <div style={styles.labelNote}>{line.note}</div>}
          <div style={{ flex: 1 }} />
          <div style={styles.labelMetaRow}>
            <span>{order.number}</span>
            <span>x{line.qty}</span>
          </div>
          <div style={styles.labelDateTime}>
            {order.time.toLocaleDateString("en-MY")} · {order.time.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
      <div style={styles.previewActions}>
        <button style={styles.secondaryActionBtn} disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          ← Previous
        </button>
        <button style={styles.secondaryActionBtn} onClick={() => printer.print(`label ${index + 1}/${lines.length}`)}>
          Print this label
        </button>
      </div>
      <div style={{ ...styles.previewActions, marginTop: 8 }}>
        {index < lines.length - 1 ? (
          <button style={styles.primaryActionBtn} onClick={() => setIndex((i) => i + 1)}>
            Next label →
          </button>
        ) : (
          <button style={styles.primaryActionBtn} onClick={onDone}>
            Done — new order
          </button>
        )}
      </div>
      <div style={styles.previewNote}>
        Simulated ~50mm x 30mm sticker. This is the kitchen's copy — one label per line, ice level and note included, no prices.
      </div>
    </div>
  );
}

// ---- Settings screen ------------------------------------------------------
function SettingsScreen({ biz, setBiz, onClose }) {
  const [draft, setDraft] = useState(biz);

  return (
    <div style={styles.settingsWrap}>
      <div style={styles.settingsCard}>
        <div style={styles.settingsTitle}>Business details</div>
        <div style={styles.settingsHint}>Shown on every receipt as required for SST compliance.</div>

        <label style={styles.field}>
          <span>Business name</span>
          <input style={styles.input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label style={styles.field}>
          <span>SSM registration no.</span>
          <input style={styles.input} value={draft.ssm} onChange={(e) => setDraft({ ...draft, ssm: e.target.value })} />
        </label>
        <label style={styles.field}>
          <span>Address</span>
          <input style={styles.input} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
        </label>

        <label style={styles.checkboxField}>
          <input type="checkbox" checked={draft.sstRegistered} onChange={(e) => setDraft({ ...draft, sstRegistered: e.target.checked })} />
          <span>SST registered business</span>
        </label>
        {draft.sstRegistered && (
          <>
            <label style={styles.field}>
              <span>SST registration no.</span>
              <input style={styles.input} value={draft.sstNo} onChange={(e) => setDraft({ ...draft, sstNo: e.target.value })} />
            </label>
            <label style={styles.field}>
              <span>SST rate (%)</span>
              <input style={styles.input} type="number" value={draft.sstRate} onChange={(e) => setDraft({ ...draft, sstRate: Number(e.target.value) })} />
            </label>
          </>
        )}

        <div style={styles.settingsDivider} />
        <div style={styles.settingsHint}>Receipt and label printers connect separately — see the two rows under the header.</div>
        <label style={styles.checkboxField}>
          <input type="checkbox" checked={draft.autoPrintReceipt} onChange={(e) => setDraft({ ...draft, autoPrintReceipt: e.target.checked })} />
          <span>Auto-print receipt when payment is confirmed</span>
        </label>
        <label style={styles.checkboxField}>
          <input type="checkbox" checked={draft.autoPrintLabels} onChange={(e) => setDraft({ ...draft, autoPrintLabels: e.target.checked })} />
          <span>Auto-print labels when payment is confirmed</span>
        </label>

        <div style={styles.settingsDivider} />
        <div style={styles.settingsHint}>Passwords required for backoffice edits, cashier discounts, and refunds.</div>
        <label style={styles.field}>
          <span>Manager password (menu edits, refunds)</span>
          <input style={styles.input} value={draft.managerPassword} onChange={(e) => setDraft({ ...draft, managerPassword: e.target.value })} />
        </label>
        <label style={styles.field}>
          <span>Discount password</span>
          <input style={styles.input} value={draft.discountPassword} onChange={(e) => setDraft({ ...draft, discountPassword: e.target.value })} />
        </label>

        <div style={styles.previewActions}>
          <button style={styles.secondaryActionBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={styles.primaryActionBtn}
            onClick={() => {
              setBiz(draft);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Daily closing (cashier Z-report) ------------------------------------
function DailyClosingScreen({ orders, onClose }) {
  const [closedAt, setClosedAt] = useState(null);
  const today = new Date();
  const todaysOrders = orders.filter((o) => isSameDay(o.time, today));
  const s = summarize(todaysOrders);
  const products = salesByProduct(todaysOrders);

  return (
    <div style={styles.previewWrap}>
      <div style={styles.paperFrame}>
        <div style={styles.paper}>
          <div style={styles.recCenter}>Daily closing</div>
          <div style={styles.recCenterSmall}>{today.toLocaleDateString("en-MY")}</div>
          <div style={styles.recDivider} />
          <div style={styles.recRow}>
            <span>Total orders</span>
            <span>{s.totalOrders}</span>
          </div>
          <div style={{ ...styles.recRow, fontWeight: 500, fontSize: 14 }}>
            <span>Total sales</span>
            <span>{fmt(s.net)}</span>
          </div>
          <div style={styles.recDivider} />
          <div style={styles.recRow}>
            <span>Cash collected</span>
            <span>{fmt(s.cash)}</span>
          </div>
          <div style={styles.recRow}>
            <span>QR collected</span>
            <span>{fmt(s.qr)}</span>
          </div>
          {s.rounding !== 0 && (
            <div style={styles.recRow}>
              <span>Rounding variance</span>
              <span>
                {s.rounding > 0 ? "+" : ""}
                {fmt(s.rounding)}
              </span>
            </div>
          )}
          {s.refundCount > 0 && (
            <>
              <div style={styles.recDivider} />
              <div style={styles.recRow}>
                <span>Refunds</span>
                <span>
                  {s.refundCount} · -{fmt(s.refundAmount)}
                </span>
              </div>
            </>
          )}
          <div style={styles.recDivider} />
          <div style={styles.recCenterSmall}>Sales by product</div>
          {products.length === 0 ? (
            <div style={styles.recCenterSmall}>No sales yet today</div>
          ) : (
            products.map((p) => (
              <div key={p.name} style={styles.recRow}>
                <span>
                  {p.name} x{p.qty}
                </span>
                <span>{fmt(p.amount)}</span>
              </div>
            ))
          )}
          <div style={styles.recDivider} />
          {closedAt ? (
            <div style={styles.recCenterSmall}>Closed at {closedAt.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</div>
          ) : (
            <div style={styles.recCenterSmall}>Not yet closed</div>
          )}
        </div>
      </div>

      <div style={styles.previewActions}>
        <button style={styles.secondaryActionBtn} onClick={onClose}>
          Back to order
        </button>
        <button style={styles.primaryActionBtn} onClick={() => setClosedAt(new Date())}>
          {closedAt ? "Re-print summary" : "Close day & print"}
        </button>
      </div>
      <div style={styles.previewNote}>Cashier-facing, today only. Full history and custom date ranges live in backoffice reports (☰).</div>
    </div>
  );
}

// ---- Backoffice: menu management + reports --------------------------------
function BackofficeScreen({ menu, setMenu, bundles, setBundles, orders, managerPassword, requestPassword, isLoggedInAdmin, onRefund, onClose }) {
  const [tab, setTab] = useState("menu"); // menu | reports

  return (
    <div style={styles.settingsWrap}>
      <div style={styles.backofficeHeader}>
        <div style={styles.settingsTitle}>Backoffice</div>
        <button style={styles.doneBtn} onClick={onClose}>
          Done
        </button>
      </div>

      <div style={styles.boTabRow}>
        <button style={{ ...styles.boTab, ...(tab === "menu" ? styles.boTabActive : {}) }} onClick={() => setTab("menu")}>
          Menu & pricing
        </button>
        <button style={{ ...styles.boTab, ...(tab === "stock" ? styles.boTabActive : {}) }} onClick={() => setTab("stock")}>
          Stock Balance
        </button>
        <button style={{ ...styles.boTab, ...(tab === "reports" ? styles.boTabActive : {}) }} onClick={() => setTab("reports")}>
          Reports
        </button>
      </div>

      {tab === "menu" && <MenuManagement menu={menu} setMenu={setMenu} bundles={bundles} setBundles={setBundles} managerPassword={managerPassword} requestPassword={requestPassword} isLoggedInAdmin={isLoggedInAdmin} />}
      {tab === "stock" && <StockBalancePanel menu={menu} setMenu={setMenu} />}
      {tab === "reports" && <ReportsPanel orders={orders} managerPassword={managerPassword} requestPassword={requestPassword} onRefund={onRefund} />}
    </div>
  );
}

// ---- Menu management (item + bundle CRUD, password gated) -------------------
function MenuManagement({ menu, setMenu, bundles, setBundles, managerPassword, requestPassword, isLoggedInAdmin }) {
  const [addingCat, setAddingCat] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftIce, setDraftIce] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingBundle, setEditingBundle] = useState(null);
  const [addingBundle, setAddingBundle] = useState(false);

  const toggleSoldOut = (id) => setMenu((m) => m.map((it) => (it.id === id ? { ...it, soldOut: !it.soldOut } : it)));
  // Sophia and Kenneth are both already authenticated as themselves
  // specifically (this whole page is restricted to their two accounts) —
  // the manager password was really gating "is this the manager, not just
  // whoever's got the till open," which doesn't apply to either of them.
  // Still gated for anyone else this page might ever be opened by.
  const gated = (title, fn) => (isLoggedInAdmin ? fn() : requestPassword(title, managerPassword, fn));

  const startAdd = (cat) => {
    setAddingCat(cat);
    setDraftName("");
    setDraftPrice("");
    setDraftIce(false);
  };

  const confirmAdd = () => {
    const price = parseFloat(draftPrice);
    if (!draftName.trim() || isNaN(price) || price < 0) return;
    gated("Manager approval — add item", () => {
      setMenu((m) => [...m, { id: `new-${Date.now()}`, cat: addingCat, name: draftName.trim(), price, hasCustom: draftIce, soldOut: false }]);
    });
    setAddingCat(null);
  };

  const saveEdit = (patch) => {
    gated("Manager approval — save changes", () => {
      setMenu((m) => m.map((it) => (it.id === editingItem.id ? { ...it, ...patch } : it)));
    });
    setEditingItem(null);
  };

  const deleteItem = (item) => {
    gated("Manager approval — delete item", () => setMenu((m) => m.filter((it) => it.id !== item.id)));
  };

  const saveBundle = (bundle) => {
    const isNew = !bundles.some((b) => b.id === bundle.id);
    gated(`Manager approval — ${isNew ? "add" : "save"} bundle`, () => {
      setBundles((bs) => (isNew ? [...bs, bundle] : bs.map((b) => (b.id === bundle.id ? bundle : b))));
    });
    setEditingBundle(null);
    setAddingBundle(false);
  };

  const deleteBundle = (bundle) => {
    gated("Manager approval — delete bundle", () => setBundles((bs) => bs.filter((b) => b.id !== bundle.id)));
  };

  return (
    <>
      <div style={styles.settingsHint}>Marking sold out is instant. Renaming, price changes, deleting, or adding needs a manager password.</div>

      {CATEGORIES.map((cat) => (
        <div key={cat} style={styles.backofficeSection}>
          <div style={styles.backofficeSectionTitle}>{cat}</div>
          {menu
            .filter((it) => it.cat === cat)
            .map((it) => (
              <div key={it.id} style={styles.backofficeRow}>
                {it.photoUrl && <img src={it.photoUrl} alt={it.name} style={styles.backofficeThumb} />}
                <div style={{ flex: 1 }}>
                  <div style={it.soldOut ? styles.backofficeItemNameSoldOut : styles.backofficeItemName}>{it.name}</div>
                  <div style={styles.backofficeItemMeta}>
                    {fmt(it.price)}
                    {it.hasCustom ? " · ice" : ""}
                    {it.variations?.length > 0 ? ` · ${it.variations.length} variation${it.variations.length > 1 ? "s" : ""}` : ""}
                    {it.trackStock ? ` · Stock: ${it.stockQty}` : ""}
                  </div>
                </div>
                <button style={it.soldOut ? styles.soldOutBtnActive : styles.soldOutBtn} onClick={() => toggleSoldOut(it.id)}>
                  {it.soldOut ? "Sold out" : "Mark sold out"}
                </button>
                <button style={styles.smallBtn} onClick={() => setEditingItem(it)}>
                  Edit
                </button>
                <button style={styles.removeBtn} onClick={() => deleteItem(it)}>
                  ✕
                </button>
              </div>
            ))}

          {addingCat === cat ? (
            <div style={styles.backofficeAddRow}>
              <input style={styles.backofficeNameInput} placeholder="Item name" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
              <div style={styles.backofficePriceWrap}>
                <span style={styles.backofficePriceLabel}>RM</span>
                <input style={styles.backofficePriceInput} type="number" step="0.10" placeholder="0.00" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} />
              </div>
              <label style={styles.backofficeIceToggle}>
                <input type="checkbox" checked={draftIce} onChange={(e) => setDraftIce(e.target.checked)} />
                <span>Ice</span>
              </label>
              <button style={styles.smallBtn} onClick={confirmAdd}>
                Add
              </button>
              <button style={styles.smallBtn} onClick={() => setAddingCat(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button style={styles.backofficeAddBtn} onClick={() => startAdd(cat)}>
              + Add item to {cat}
            </button>
          )}
        </div>
      ))}

      <div style={styles.backofficeSection}>
        <div style={styles.backofficeSectionTitle}>Bundle / set promotions</div>
        {bundles.map((b) => (
          <div key={b.id} style={styles.backofficeRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.backofficeItemName}>{b.name}</div>
              <div style={styles.backofficeItemMeta}>
                {fmt(b.price)} · {b.itemIds.length} items
              </div>
            </div>
            <button style={styles.smallBtn} onClick={() => setEditingBundle(b)}>
              Edit
            </button>
            <button style={styles.removeBtn} onClick={() => deleteBundle(b)}>
              ✕
            </button>
          </div>
        ))}
        <button style={styles.backofficeAddBtn} onClick={() => setAddingBundle(true)}>
          + Add bundle
        </button>
      </div>

      {editingItem && <EditItemModal item={editingItem} onCancel={() => setEditingItem(null)} onSave={saveEdit} />}
      {(editingBundle || addingBundle) && (
        <BundleEditModal
          bundle={editingBundle}
          menu={menu}
          onCancel={() => {
            setEditingBundle(null);
            setAddingBundle(false);
          }}
          onSave={saveBundle}
        />
      )}
    </>
  );
}

// ---- Stock Balance (live view — Sophia and Kenneth both just look here,
// no password needed to VIEW; only editing quantity still goes through
// Menu & pricing's manager-password gate) --------------------------------
function StockBalancePanel({ menu, setMenu }) {
  const tracked = menu.filter((it) => it.trackStock);
  const untracked = menu.filter((it) => !it.trackStock);
  const [restockingId, setRestockingId] = useState(null);
  const [restockAmount, setRestockAmount] = useState("");

  const startRestock = (id) => {
    setRestockingId(id);
    setRestockAmount("");
  };

  const confirmRestock = (item) => {
    const add = parseFloat(restockAmount);
    if (isNaN(add) || add <= 0) return;
    setMenu((m) => m.map((it) => (it.id === item.id ? { ...it, stockQty: it.stockQty + add, soldOut: it.stockQty + add > 0 ? false : it.soldOut } : it)));
    setRestockingId(null);
    setRestockAmount("");
  };

  return (
    <div>
      <div style={styles.settingsHint}>Updates automatically with every sale. Use "+ Restock" below to add newly-arrived stock — to change the total directly, or to start tracking a new item, edit it under Menu & pricing instead.</div>
      {CATEGORIES.map((cat) => {
        const items = tracked.filter((it) => it.cat === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={styles.backofficeSection}>
            <div style={styles.backofficeSectionTitle}>{cat}</div>
            {items.map((it) => (
              <div key={it.id}>
                <div style={styles.backofficeRow}>
                  <div style={{ flex: 1 }}>
                    <div style={it.soldOut ? styles.backofficeItemNameSoldOut : styles.backofficeItemName}>{it.name}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: it.stockQty <= 0 ? dangerRed : it.stockQty <= 5 ? "#B45309" : teal }}>
                    {it.stockQty}
                  </div>
                  <button style={styles.smallBtn} onClick={() => (restockingId === it.id ? setRestockingId(null) : startRestock(it.id))}>
                    {restockingId === it.id ? "Cancel" : "+ Restock"}
                  </button>
                </div>
                {restockingId === it.id && (
                  <div style={styles.backofficeAddRow}>
                    <input
                      style={styles.backofficePriceInput}
                      type="number"
                      step="1"
                      autoFocus
                      placeholder="Qty received"
                      value={restockAmount}
                      onChange={(e) => setRestockAmount(e.target.value)}
                    />
                    <button style={styles.smallBtn} onClick={() => confirmRestock(it)}>
                      Add to stock
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {!tracked.length && <div style={styles.cartEmpty}>No items are tracked for stock yet — turn on tracking when editing an item under Menu & pricing.</div>}
      {untracked.length > 0 && (
        <div style={styles.backofficeSection}>
          <div style={styles.backofficeSectionTitle}>Not stock-tracked ({untracked.length})</div>
          <div style={styles.settingsHint}>Made-to-order items — sold-out is a manual switch for these, no quantity to track.</div>
        </div>
      )}
    </div>
  );
}

// ---- Reports panel --------------------------------------------------------
function ReportsPanel({ orders, managerPassword, requestPassword, onRefund }) {
  const [period, setPeriod] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const filtered = useMemo(() => filterOrdersByPeriod(orders, period, customStart, customEnd), [orders, period, customStart, customEnd]);
  const s = useMemo(() => summarize(filtered), [filtered]);
  const products = useMemo(() => salesByProduct(filtered), [filtered]);
  const topAmount = products.length ? products[0].amount : 0;

  const periodLabel = { today: "Today", week: "This week", month: "This month", all: "All time", custom: "Custom period" }[period];

  const requestRefund = (order) => {
    requestPassword(`Manager approval — refund ${order.number}`, managerPassword, () => onRefund(order));
  };

  return (
    <div>
      <div style={styles.pillRow}>
        {[
          ["today", "Today"],
          ["week", "This week"],
          ["month", "This month"],
          ["all", "All time"],
          ["custom", "Custom"],
        ].map(([key, label]) => (
          <button key={key} style={{ ...styles.pill, ...(period === key ? styles.pillActive : {}) }} onClick={() => setPeriod(key)}>
            {label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div style={styles.customDateRow}>
          <input style={styles.input} type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <span style={styles.settingsHint}>to</span>
          <input style={styles.input} type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
        </div>
      )}

      {/* Headline numbers — the two figures anyone checking a report wants
          first, made prominent rather than buried in a grid of equal-weight
          cards. */}
      <div style={styles.reportHeroRow}>
        <div style={styles.reportHeroCard}>
          <div style={styles.reportHeroLabel}>Net Sales — {periodLabel}</div>
          <div style={styles.reportHeroValue}>{fmt(s.net)}</div>
          <div style={styles.reportHeroSubValue}>{s.totalOrders} order{s.totalOrders === 1 ? "" : "s"}</div>
        </div>
        <div style={styles.reportHeroCard}>
          <div style={styles.reportHeroLabel}>Gross Sales</div>
          <div style={styles.reportHeroValue}>{fmt(s.gross)}</div>
          <div style={styles.reportHeroSubValue}>{s.discounts > 0 ? `-${fmt(s.discounts)} in discounts` : "No discounts given"}</div>
        </div>
      </div>

      <div style={styles.reportCard}>
        <div style={styles.reportCardTitle}>Payment breakdown</div>
        <div style={styles.reportCardSub}>How this period's sales were collected</div>
        <div style={styles.reportKpiGrid}>
          <div style={styles.reportKpi}>
            <div style={styles.reportKpiLabel}>Cash</div>
            <div style={styles.reportKpiValue}>{fmt(s.cash)}</div>
          </div>
          <div style={styles.reportKpi}>
            <div style={styles.reportKpiLabel}>QR</div>
            <div style={styles.reportKpiValue}>{fmt(s.qr)}</div>
          </div>
          <div style={styles.reportKpi}>
            <div style={styles.reportKpiLabel}>SST collected</div>
            <div style={styles.reportKpiValue}>{fmt(s.sst)}</div>
          </div>
          <div style={styles.reportKpi}>
            <div style={styles.reportKpiLabel}>Discounts given</div>
            <div style={s.discounts > 0 ? styles.reportKpiValueNeg : styles.reportKpiValue}>{s.discounts > 0 ? `-${fmt(s.discounts)}` : fmt(0)}</div>
          </div>
          <div style={styles.reportKpi}>
            <div style={styles.reportKpiLabel}>Cash rounding</div>
            <div style={styles.reportKpiValue}>{fmt(s.rounding)}</div>
          </div>
          {s.refundCount > 0 && (
            <div style={styles.reportKpi}>
              <div style={styles.reportKpiLabel}>Refunded</div>
              <div style={styles.reportKpiValueNeg}>
                {s.refundCount} · -{fmt(s.refundAmount)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={styles.reportCard}>
        <div style={styles.reportCardTitle}>Sales by product</div>
        <div style={styles.reportCardSub}>Ranked by revenue, {periodLabel.toLowerCase()}</div>
        {products.length === 0 && <div style={styles.cartEmpty}>No orders in this period.</div>}
        {products.length > 0 && (
          <div style={styles.reportTableHead}>
            <span style={styles.reportRankCol}></span>
            <span style={{ flex: 1 }}>Product</span>
            <span style={{ minWidth: 70, textAlign: "center" }}>Qty</span>
            <span style={{ minWidth: 70, textAlign: "right" }}>Amount</span>
          </div>
        )}
        {products.map((p, i) => (
          <div key={p.name} style={styles.reportProductRowV2}>
            <div style={styles.reportRankBadge}>{i + 1}</div>
            <span style={{ flex: 1 }}>{p.name}</span>
            <div style={styles.reportBarTrack}>
              <div style={{ ...styles.reportBarFill, width: `${topAmount ? (p.amount / topAmount) * 100 : 0}%` }} />
            </div>
            <span style={{ ...styles.reportProductQty, minWidth: 28 }}>x{p.qty}</span>
            <span style={{ ...styles.reportProductAmount, minWidth: 68 }}>{fmt(p.amount)}</span>
          </div>
        ))}
      </div>

      <div style={styles.reportCard}>
        <div style={styles.reportOrdersHeader}>
          <div style={styles.reportCardTitle}>Order list</div>
          <div style={styles.reportOrdersCount}>{filtered.length} order{filtered.length === 1 ? "" : "s"}</div>
        </div>
        {filtered.length === 0 && <div style={styles.cartEmpty}>No orders in this period.</div>}
        <div style={styles.orderListWrap}>
          {[...filtered]
            .sort((a, b) => b.time - a.time)
            .map((o) => (
              <div key={o.number} style={styles.orderListRowV2}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.backofficeItemName}>
                    {o.number} {o.refunded && <span style={styles.refundedTag}>Refunded</span>}
                  </div>
                  <div style={styles.backofficeItemMeta}>
                    {o.time.toLocaleDateString("en-MY")} {o.time.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })} · {o.lines.length} item
                    {o.lines.length > 1 ? "s" : ""}
                  </div>
                </div>
                <span
                  style={{
                    ...styles.paymentBadge,
                    ...(o.paymentMethod === "cash" ? styles.paymentBadgeCash : o.paymentMethod === "qr" ? styles.paymentBadgeQr : styles.paymentBadgeSplit),
                  }}
                >
                  {o.paymentMethod === "cash" ? "CASH" : o.paymentMethod === "qr" ? "QR" : "SPLIT"}
                </span>
                <div style={{ ...styles.orderListTotal, ...(o.refunded ? styles.orderListTotalRefunded : {}) }}>{fmt(o.total)}</div>
                {!o.refunded && (
                  <button style={styles.smallBtn} onClick={() => requestRefund(o)}>
                    Refund
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ---- Edit item modal ----------------------------------------------------
function EditItemModal({ item, onCancel, onSave }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [ice, setIce] = useState(item.hasCustom);
  const [variations, setVariations] = useState(item.variations || []);
  const [newVarName, setNewVarName] = useState("");
  const [newVarPrice, setNewVarPrice] = useState("");
  const [trackStock, setTrackStock] = useState(!!item.trackStock);
  const [stockQty, setStockQty] = useState(String(item.stockQty ?? 0));
  const [photoUrl, setPhotoUrl] = useState(item.photoUrl || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file"); return; }
    setError("");
    setUploadingPhoto(true);
    const url = await uploadMenuPhoto(item.id, file);
    setUploadingPhoto(false);
    if (!url) { setError("Photo upload failed — please check your connection and try again."); return; }
    setPhotoUrl(url);
  };

  const addVariation = () => {
    const p = parseFloat(newVarPrice);
    if (!newVarName.trim() || isNaN(p) || p < 0) return;
    setVariations((v) => [...v, { id: `var-${Date.now()}`, name: newVarName.trim(), price: p }]);
    setNewVarName("");
    setNewVarPrice("");
  };
  const removeVariation = (id) => setVariations((v) => v.filter((x) => x.id !== id));

  const submit = () => {
    const p = parseFloat(price);
    if (!name.trim()) return setError("Name can't be empty");
    if (isNaN(p) || p < 0) return setError("Enter a valid price");
    const qty = parseFloat(stockQty);
    if (trackStock && (isNaN(qty) || qty < 0)) return setError("Enter a valid stock quantity");
    onSave({ name: name.trim(), price: p, hasCustom: ice, variations, trackStock, stockQty: trackStock ? qty : 0, photoUrl });
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalCard, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={styles.modalTitle}>Edit item</div>

        <div style={styles.modalLabel}>Photo</div>
        {photoUrl && <img src={photoUrl} alt={name} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}
        <label style={{ ...styles.backofficeAddBtn, display: "inline-block", textAlign: "center", cursor: uploadingPhoto ? "default" : "pointer" }}>
          {uploadingPhoto ? "Uploading…" : photoUrl ? "Replace photo" : "+ Add photo"}
          <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploadingPhoto} style={{ display: "none" }} />
        </label>

        <label style={styles.field}>
          <span>Name</span>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={styles.field}>
          <span>Price (RM) — the "Regular" option</span>
          <input style={styles.input} type="number" step="0.10" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label style={styles.checkboxField}>
          <input type="checkbox" checked={ice} onChange={(e) => setIce(e.target.checked)} />
          <span>Show ice-level picker</span>
        </label>

        <div style={styles.settingsDivider} />
        <label style={styles.checkboxField}>
          <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
          <span>Track stock quantity for this item</span>
        </label>
        {trackStock && (
          <label style={styles.field}>
            <span>Current stock quantity</span>
            <input style={styles.input} type="number" step="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
          </label>
        )}
        <div style={styles.settingsHint}>
          {trackStock
            ? "Stock goes down automatically with every sale, and this item auto-marks Sold Out once it hits zero."
            : "Leave off for made-to-order items (most drinks) — sold-out stays a manual switch only."}
        </div>

        <div style={styles.modalLabel}>Variations (optional — e.g. size, add-on)</div>
        {variations.map((v) => (
          <div key={v.id} style={styles.backofficeRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.backofficeItemName}>{v.name}</div>
              <div style={styles.backofficeItemMeta}>{fmt(v.price)}</div>
            </div>
            <button style={styles.removeBtn} onClick={() => removeVariation(v.id)}>
              ✕
            </button>
          </div>
        ))}
        <div style={styles.backofficeAddRow}>
          <input style={styles.backofficeNameInput} placeholder="e.g. Large" value={newVarName} onChange={(e) => setNewVarName(e.target.value)} />
          <div style={styles.backofficePriceWrap}>
            <span style={styles.backofficePriceLabel}>RM</span>
            <input style={styles.backofficePriceInput} type="number" step="0.10" placeholder="0.00" value={newVarPrice} onChange={(e) => setNewVarPrice(e.target.value)} />
          </div>
          <button style={styles.smallBtn} onClick={addVariation}>
            Add
          </button>
        </div>

        {error && <div style={styles.errorText}>{error}</div>}
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.modalConfirmBtn} onClick={submit}>
            Save (needs password)
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Bundle edit modal ---------------------------------------------------
function BundleEditModal({ bundle, menu, onCancel, onSave }) {
  const [name, setName] = useState(bundle?.name || "");
  const [price, setPrice] = useState(bundle ? String(bundle.price) : "");
  const [itemIds, setItemIds] = useState(bundle?.itemIds || []);
  const [error, setError] = useState("");

  const toggleItem = (id) => setItemIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = () => {
    const p = parseFloat(price);
    if (!name.trim()) return setError("Name can't be empty");
    if (isNaN(p) || p < 0) return setError("Enter a valid price");
    if (itemIds.length < 2) return setError("Select at least 2 items for a set");
    onSave({ id: bundle?.id || `bundle-${Date.now()}`, name: name.trim(), price: p, itemIds });
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalCard, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={styles.modalTitle}>{bundle ? "Edit bundle" : "Add bundle"}</div>
        <label style={styles.field}>
          <span>Set name</span>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breakfast Set" />
        </label>
        <label style={styles.field}>
          <span>Set price (RM)</span>
          <input style={styles.input} type="number" step="0.10" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <div style={styles.modalLabel}>Included items</div>
        <div style={styles.bundleItemList}>
          {menu.map((it) => (
            <label key={it.id} style={styles.bundleItemRow}>
              <input type="checkbox" checked={itemIds.includes(it.id)} onChange={() => toggleItem(it.id)} />
              <span>
                {it.name} <span style={styles.backofficeItemMeta}>({fmt(it.price)})</span>
              </span>
            </label>
          ))}
        </div>
        {error && <div style={styles.errorText}>{error}</div>}
        <div style={styles.modalActions}>
          <button style={styles.modalCancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.modalConfirmBtn} onClick={submit}>
            Save (needs password)
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Styles (inline, no build step needed for preview) ------------------------
const teal = "#0F5C4E";
const tealDark = "#04342C";
const amber = "#E8A33D";
const cream = "#F7F4EE";
const line = "#D8D2C4";
const ink = "#1F2A24";
const dangerRed = "#C1443C";

const styles = {
  app: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: cream, color: ink, minHeight: "100vh", width: "100%" },
  header: { background: "#fff", borderBottom: `1px solid ${line}` },
  headerTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px" },
  brandMark: { display: "flex", alignItems: "center", gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: "50%", background: teal },
  brandName: { fontSize: 15, fontWeight: 600, color: tealDark },
  iconBtn: { border: "none", background: "transparent", fontSize: 16, cursor: "pointer", color: "#5F5E5A" },
  printerRow: { display: "flex", alignItems: "center", gap: 6, padding: "0 14px 10px" },
  printerDot: { width: 7, height: 7, borderRadius: "50%" },
  printerStatus: { fontSize: 11, color: "#5F5E5A" },
  printerRoleLabel: { fontSize: 11, fontWeight: 600, color: "#888780", minWidth: 42 },
  smallBtn: { fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", marginLeft: 6 },
  tabRow: { display: "flex", borderTop: `1px solid ${line}` },
  tab: { flex: 1, padding: "10px 4px", fontSize: 12, border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer", borderBottom: "2px solid transparent" },
  tabActive: { color: tealDark, fontWeight: 600, borderBottom: `2px solid ${teal}` },
  orderLayout: { display: "flex", flexDirection: "column" },
  catRow: { display: "flex", gap: 6, padding: "12px 14px 0", overflowX: "auto", alignItems: "center" },
  catBtn: { fontSize: 12, padding: "6px 12px", borderRadius: 16, border: `1px solid ${line}`, background: "#fff", color: ink, cursor: "pointer", whiteSpace: "nowrap" },
  catBtnActive: { background: teal, color: "#fff", borderColor: teal },
  parkedChip: { fontSize: 11, padding: "5px 10px", borderRadius: 16, border: `1px solid ${amber}`, background: "#FAEEDA", color: "#854F0B", cursor: "pointer", marginLeft: "auto", whiteSpace: "nowrap" },
  menuGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, padding: 14 },
  menuCard: { textAlign: "left", border: `1px solid ${line}`, background: "#fff", borderRadius: 10, padding: 12, cursor: "pointer" },
  menuCardWithPhoto: { padding: 0, overflow: "hidden" },
  menuCardPhoto: { width: "100%", aspectRatio: "1376 / 1143", objectFit: "cover", display: "block" },
  menuCardBody: { padding: 12 },
  menuCardSoldOut: { opacity: 0.5, cursor: "not-allowed" },
  menuCardName: { fontSize: 13, fontWeight: 500, marginBottom: 6 },
  menuCardPrice: { fontSize: 13, color: teal, fontWeight: 600 },
  soldOutBadge: { fontSize: 11, color: dangerRed, fontWeight: 600 },
  cartPanel: { borderTop: `1px solid ${line}`, background: "#fff", padding: 14 },
  cartHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cartHeader: { fontSize: 13, fontWeight: 600 },
  textLinkBtn: { border: "none", background: "transparent", color: teal, fontSize: 12, cursor: "pointer" },
  textLinkBtnDanger: { border: "none", background: "transparent", color: dangerRed, fontSize: 12, cursor: "pointer" },
  cartList: { maxHeight: 240, overflowY: "auto" },
  cartEmpty: { fontSize: 12, color: "#888780", padding: "8px 0" },
  cartLine: { display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: `1px solid ${cream}` },
  cartLineName: { fontSize: 13 },
  cartLineMeta: { fontSize: 11, color: "#888780" },
  noteAddBtn: { border: "none", background: "transparent", color: teal, fontSize: 10.5, padding: "2px 0 0", cursor: "pointer" },
  noteEditBtn: { border: "none", background: "transparent", color: "#854F0B", fontSize: 10.5, padding: "2px 0 0", cursor: "pointer", textAlign: "left" },
  bundleTag: { fontSize: 9, fontWeight: 700, color: amber, border: `1px solid ${amber}`, borderRadius: 4, padding: "1px 4px", marginRight: 4 },
  qtyControl: { display: "flex", alignItems: "center", gap: 4, marginTop: 2 },
  qtyBtn: { width: 22, height: 22, borderRadius: 6, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", fontSize: 13, lineHeight: "20px" },
  qtyVal: { fontSize: 12, minWidth: 14, textAlign: "center" },
  cartLinePrice: { fontSize: 13, minWidth: 56, textAlign: "right", marginTop: 2 },
  removeBtn: { border: "none", background: "transparent", color: dangerRed, cursor: "pointer", fontSize: 12, marginTop: 2 },
  cartTotals: { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${line}` },
  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "3px 0", color: "#5F5E5A" },
  totalRowGrand: { fontSize: 15, fontWeight: 700, color: ink, marginTop: 4 },
  addDiscountBtn: { width: "100%", textAlign: "left", background: "transparent", border: "none", color: teal, fontSize: 12.5, padding: "4px 0", cursor: "pointer" },
  discountRemoveBtn: { marginLeft: 6, border: "none", background: "transparent", color: "#888780", fontSize: 10.5, textDecoration: "underline", cursor: "pointer" },
  checkoutBtn: { width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 10, border: "none", background: amber, color: "#412402", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  modalOverlay: { position: "absolute", inset: 0, background: "rgba(31,42,36,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modalCard: { width: "100%", background: "#fff", borderRadius: "16px 16px 0 0", padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  modalPrice: { fontSize: 13, color: teal, marginBottom: 12 },
  modalLabel: { fontSize: 12, color: "#5F5E5A", marginTop: 10, marginBottom: 6 },
  pillRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  pill: { fontSize: 12, padding: "6px 12px", borderRadius: 16, border: `1px solid ${line}`, background: "#fff", cursor: "pointer" },
  pillActive: { background: teal, color: "#fff", borderColor: teal },
  modalActions: { display: "flex", gap: 8, marginTop: 18 },
  modalCancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", fontSize: 13 },
  modalConfirmBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: teal, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  errorText: { fontSize: 11.5, color: dangerRed, marginTop: 6 },
  paymentMethodGrid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 },
  paymentMethodBtn: { padding: "18px 0", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", textAlign: "center" },
  paymentMethodLabel: { fontSize: 13, fontWeight: 600 },
  changeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "12px 14px", background: cream, borderRadius: 8, fontSize: 13 },
  changeAmount: { fontSize: 20, fontWeight: 700, color: teal },
  qrPlaceholder: { display: "flex", justifyContent: "center", margin: "10px 0" },
  qrPlaceholderInner: { width: 140, height: 140, border: `1px dashed ${line}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#888780" },
  previewWrap: { padding: 18, display: "flex", flexDirection: "column", alignItems: "center" },
  refundedBanner: { fontSize: 12, fontWeight: 700, color: dangerRed, border: `1px solid ${dangerRed}`, borderRadius: 6, padding: "4px 10px", marginBottom: 10 },
  paperFrame: { background: "#EDEAE1", padding: 12, borderRadius: 6 },
  paper: { width: 260, background: "#fff", padding: "16px 14px", fontFamily: "'Courier New', monospace", fontSize: 12, color: "#111" },
  recCenter: { textAlign: "center", fontWeight: 700, fontSize: 13 },
  recCenterSmall: { textAlign: "center", fontSize: 10.5, color: "#333" },
  recDivider: { borderTop: "1px dashed #999", margin: "8px 0" },
  recRow: { display: "flex", justifyContent: "space-between", fontSize: 11.5 },
  recSubLine: { fontSize: 10, color: "#666", paddingLeft: 8 },
  previewActions: { display: "flex", gap: 8, marginTop: 16, width: "100%", maxWidth: 260 },
  primaryActionBtn: { flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: teal, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  secondaryActionBtn: { flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", fontSize: 13, cursor: "pointer" },
  previewNote: { fontSize: 11, color: "#888780", marginTop: 12, textAlign: "center", maxWidth: 280 },
  labelCounter: { fontSize: 12, color: "#5F5E5A", marginBottom: 10 },
  labelFrame: { background: "#EDEAE1", padding: 12, borderRadius: 6 },
  label: { width: 180, height: 120, background: "#fff", border: `1px solid ${line}`, borderRadius: 4, padding: "12px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", display: "flex", flexDirection: "column" },
  labelName: { fontSize: 15, fontWeight: 600, letterSpacing: -0.2 },
  labelCustom: { fontSize: 11, color: "#5F5E5A", marginTop: 3 },
  labelNote: { fontSize: 11, color: "#854F0B", marginTop: 2, fontStyle: "italic" },
  labelMetaRow: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5F5E5A", paddingTop: 8, borderTop: `1px solid ${cream}` },
  labelDateTime: { fontSize: 10, color: "#888780", marginTop: 2 },
  settingsWrap: { padding: 18 },
  settingsCard: { background: "#fff", border: `1px solid ${line}`, borderRadius: 12, padding: 16 },
  settingsTitle: { fontSize: 15, fontWeight: 700 },
  settingsHint: { fontSize: 12, color: "#888780", marginBottom: 14 },
  settingsDivider: { borderTop: `1px solid ${line}`, margin: "14px 0" },
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#5F5E5A", marginBottom: 10 },
  input: { padding: "9px 10px", borderRadius: 8, border: `1px solid ${line}`, fontSize: 13, color: ink },
  checkboxField: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, margin: "10px 0" },
  backofficeHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  doneBtn: { padding: "9px 18px", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  boTabRow: { display: "flex", gap: 6, marginTop: 12, marginBottom: 4 },
  boTab: { flex: 1, padding: "8px 0", fontSize: 12.5, borderRadius: 8, border: `1px solid ${line}`, background: "#fff", color: "#5F5E5A", cursor: "pointer" },
  boTabActive: { background: teal, color: "#fff", borderColor: teal, fontWeight: 600 },
  backofficeSection: { marginTop: 18 },
  backofficeSectionTitle: { fontSize: 12, fontWeight: 600, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  backofficeRow: { display: "flex", alignItems: "center", gap: 6, padding: "8px 0", borderBottom: `1px solid ${cream}` },
  backofficeThumb: { width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 },
  backofficeItemName: { fontSize: 13 },
  backofficeItemNameSoldOut: { fontSize: 13, color: "#888780", textDecoration: "line-through" },
  backofficeItemMeta: { fontSize: 11, color: "#888780" },
  soldOutBtn: { fontSize: 10.5, padding: "4px 8px", borderRadius: 6, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", whiteSpace: "nowrap" },
  soldOutBtnActive: { fontSize: 10.5, padding: "4px 8px", borderRadius: 6, border: `1px solid ${dangerRed}`, background: "#FCEBEB", color: dangerRed, cursor: "pointer", whiteSpace: "nowrap" },
  backofficeAddRow: { display: "flex", alignItems: "center", gap: 6, padding: "8px 0", borderTop: `1px dashed ${line}`, marginTop: 4, flexWrap: "wrap" },
  backofficeNameInput: { flex: 1, minWidth: 90, padding: "6px 8px", borderRadius: 6, border: `1px solid ${line}`, fontSize: 12.5, color: ink },
  backofficePriceWrap: { display: "flex", alignItems: "center", gap: 2 },
  backofficePriceLabel: { fontSize: 11, color: "#888780" },
  backofficePriceInput: { width: 56, padding: "6px 6px", borderRadius: 6, border: `1px solid ${line}`, fontSize: 12.5, color: ink },
  backofficeIceToggle: { display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#5F5E5A", whiteSpace: "nowrap" },
  backofficeAddBtn: { width: "100%", marginTop: 6, padding: "8px 0", borderRadius: 8, border: `1px dashed ${line}`, background: "transparent", color: teal, fontSize: 12.5, cursor: "pointer" },
  bundleItemList: { maxHeight: 180, overflowY: "auto", border: `1px solid ${cream}`, borderRadius: 8, padding: 8 },
  bundleItemRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "5px 0" },
  customDateRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 },
  reportMetricGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 },
  metricCard: { background: cream, borderRadius: 8, padding: "10px 12px" },
  metricLabel: { fontSize: 11, color: "#888780" },
  metricValue: { fontSize: 16, fontWeight: 700, marginTop: 2 },
  reportProductRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${cream}`, fontSize: 12.5 },
  reportProductName: { flex: 1 },
  reportProductQty: { color: "#888780", minWidth: 32, textAlign: "right" },
  reportProductAmount: { minWidth: 64, textAlign: "right", fontWeight: 600 },
  orderListWrap: { maxHeight: 260, overflowY: "auto" },
  orderListRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, padding: "8px 0", borderBottom: `1px solid ${cream}` },
  orderListTotal: { fontSize: 13, fontWeight: 600 },
  orderListTotalRefunded: { textDecoration: "line-through", color: "#888780" },
  refundedTag: { fontSize: 9.5, fontWeight: 700, color: dangerRed, border: `1px solid ${dangerRed}`, borderRadius: 4, padding: "1px 4px", marginLeft: 4 },

  // ---- Reports redesign ----------------------------------------------------
  reportCard: { background: "#fff", border: `1px solid ${line}`, borderRadius: 12, padding: 16, marginTop: 14 },
  reportCardTitle: { fontSize: 13, fontWeight: 700, color: ink, marginBottom: 2 },
  reportCardSub: { fontSize: 11, color: "#888780", marginBottom: 12 },
  reportHeroRow: { display: "flex", gap: 10, marginBottom: 10 },
  reportHeroCard: { flex: 1, background: tealDark, borderRadius: 10, padding: "14px 16px" },
  reportHeroLabel: { fontSize: 10.5, color: "rgba(255,255,255,.65)", textTransform: "uppercase", letterSpacing: 0.5 },
  reportHeroValue: { fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 3 },
  reportHeroSubValue: { fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 2 },
  reportKpiGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  reportKpi: { background: cream, borderRadius: 8, padding: "10px 10px" },
  reportKpiLabel: { fontSize: 10.5, color: "#888780" },
  reportKpiValue: { fontSize: 14, fontWeight: 700, marginTop: 2, color: ink },
  reportKpiValueNeg: { fontSize: 14, fontWeight: 700, marginTop: 2, color: dangerRed },
  reportTableHead: { display: "flex", alignItems: "center", gap: 8, padding: "0 0 8px", borderBottom: `1.5px solid ${ink}`, fontSize: 10.5, fontWeight: 700, color: "#888780", textTransform: "uppercase", letterSpacing: 0.4 },
  reportRankCol: { width: 20, flexShrink: 0 },
  reportProductRowV2: { display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: `1px solid ${cream}`, fontSize: 13 },
  reportRankBadge: { width: 20, height: 20, borderRadius: "50%", background: cream, color: "#5F5E5A", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  reportBarTrack: { flex: 1, height: 5, background: cream, borderRadius: 3, overflow: "hidden", margin: "0 4px" },
  reportBarFill: { height: "100%", background: teal, borderRadius: 3 },
  reportOrdersHeader: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 },
  reportOrdersCount: { fontSize: 11, color: "#888780" },
  orderListRowV2: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: `1px solid ${cream}` },
  paymentBadge: { fontSize: 9.5, fontWeight: 700, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" },
  paymentBadgeCash: { background: "#F0EAD6", color: "#854F0B" },
  paymentBadgeQr: { background: "#E1EFEC", color: teal },
  paymentBadgeSplit: { background: "#EAE3F5", color: "#5B3E96" },
};
