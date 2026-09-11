<template>
  <q-page class="page">
    <div class="page-shell">

      <header class="page-header">
        <div class="page-header__main" />
        <button class="btn btn--ghost" @click="$router.push('/')">
          <q-icon name="close" size="16px" />
          <span>Odustani</span>
        </button>
      </header>

      <div class="shop">

        <!-- Glavni prostor: zasad prazan -->
        <main class="shop__main" />

        <!-- Košarica -->
        <aside class="cart">
          <div class="cart__header">
            <span class="cart__title">
              <q-icon name="shopping_cart" size="16px" />
              <span>Košarica</span>
            </span>
            <span class="cart__count">{{ cartItems.length }}</span>
          </div>

          <div v-if="!cartItems.length" class="cart__empty">
            <q-icon name="remove_shopping_cart" size="32px" class="cart__empty-icon" />
            <span class="cart__empty-title">Košarica je prazna</span>
          </div>

          <ul v-else class="cart__list">
            <li v-for="item in cartItems" :key="item.id" class="cart__item">
              <span class="cart__item-name">{{ item.name }}</span>
              <span class="cart__item-qty">× {{ item.quantity }}</span>
            </li>
          </ul>

          <div class="cart__footer">
            <button class="btn btn--primary cart__submit" :disabled="!cartItems.length">
              <span>Pošalji zahtjev</span>
            </button>
          </div>
        </aside>

      </div>

    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue';

const cartItems = ref([]);
</script>

<style scoped>
/* ─── Page ─── */
.page {
  background: transparent;
  padding: 32px 40px;
  font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #111827;
}
.page-shell { max-width: 1400px; margin: 0 auto; }

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.page-header__main { flex: 1; }
.page-header .btn { min-width: 140px; }

/* ─── Layout: sadržaj + košarica ─── */
.shop {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: start;
  gap: 24px;
}

.shop__main { min-height: 60vh; }

/* ─── Košarica (navy/indigo, kao kartica Unutarnja nabava) ─── */
.cart {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
  background: #ffffff;
  border: 1.5px solid rgba(91, 108, 222, 0.35);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(91, 108, 222, 0.12);
  overflow: hidden;
}

.cart__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(145deg, #eef0fe 0%, #dde2fb 100%);
  border-bottom: 1.5px solid rgba(91, 108, 222, 0.2);
}

.cart__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1b2d59;
  font-size: 0.875rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cart__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: #5b6cde;
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cart__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 20px;
  text-align: center;
}
.cart__empty-icon { color: #c7cdf5; }
.cart__empty-title { color: #6b7280; font-size: 0.875rem; font-weight: 600; }

.cart__list {
  flex: 1;
  margin: 0;
  padding: 8px 0;
  list-style: none;
  overflow-y: auto;
}

.cart__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  font-size: 0.875rem;
}
.cart__item + .cart__item { border-top: 1px solid #f3f4f6; }
.cart__item-name { color: #111827; font-weight: 600; }
.cart__item-qty { color: #6b7280; font-variant-numeric: tabular-nums; }

.cart__footer {
  padding: 16px 20px;
  border-top: 1.5px solid rgba(91, 108, 222, 0.2);
}
.cart__submit { width: 100%; }

@media (max-width: 900px) {
  .shop { grid-template-columns: 1fr; }
  .shop__main { min-height: 0; }
  .cart { position: static; max-height: none; }
}

@media (max-width: 600px) {
  .page { padding: 20px 16px; }
}
</style>
