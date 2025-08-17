
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const state = {
    product: null,
    currentVariant: null,
    addonProduct: null // set from JSON script if provided
  };

  /** money helper */
  function formatMoney(cents){
    try { return Shopify.formatMoney(cents); } 
    catch(e){ return (cents/100).toLocaleString(undefined, {style:'currency',currency:'USD'}); }
  }

  /** modal elements (created in section markup) */
  const modalRoot = $('[data-ee-modal-root]');
  if(!modalRoot) return; // grid section not on this page

  const el = {
    backdrop: $('.ee-modal__backdrop', modalRoot),
    img: $('[data-ee-modal-img]', modalRoot),
    title: $('[data-ee-modal-title]', modalRoot),
    price: $('[data-ee-modal-price]', modalRoot),
    desc: $('[data-ee-modal-desc]', modalRoot),
    options: $('[data-ee-modal-options]', modalRoot),
    qty: $('[data-ee-modal-qty]', modalRoot),
    addBtn: $('[data-ee-add]', modalRoot),
    closeBtns: $$('.ee-close, [data-ee-close]', modalRoot)
  };

  /** read addon product (Soft Winter Jacket) JSON if present */
  const addonJSON = $('#ee-addon-product');
  if(addonJSON){
    try { state.addonProduct = JSON.parse(addonJSON.textContent.trim()); } catch(e){}
  }

  /** open modal for a product */
  function openModal(product){
    state.product = product;
    // pick first available variant
    state.currentVariant = product.variants.find(v => v.available) || product.variants[0];

    // fill header/content
    el.img.src = product.featured_image ? product.featured_image : (product.images && product.images[0]) || '';
    el.img.alt = product.title || '';
    el.title.textContent = product.title;
    el.price.textContent = formatMoney((state.currentVariant || product.variants[0]).price);
    el.desc.innerHTML = product.description || '';

    // build options UI
    el.options.innerHTML = '';
    (product.options_with_values || []).forEach((opt, i) => {
      const row = document.createElement('div');
      row.className = 'ee-row';

      const label = document.createElement('label');
      label.textContent = opt.name;
      const select = document.createElement('select');
      select.className = 'ee-select';
      select.setAttribute('data-ee-opt-index', i);

      opt.values.forEach(val => {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = val;
        // preselect from currentVariant
        if (state.currentVariant && state.currentVariant.options[i] === val) o.selected = true;
        select.appendChild(o);
      });

      select.addEventListener('change', onOptionsChange);
      row.appendChild(label); row.appendChild(select);
      el.options.appendChild(row);
    });

    el.qty.value = 1;
    modalRoot.classList.add('ee-state--open');
  }

  /** find variant from selected options */
  function onOptionsChange(){
    if(!state.product) return;
    const chosen = $$('.ee-select', el.options).map(sel => sel.value);
    const match = state.product.variants.find(v => v.options.every((val, idx) => val === chosen[idx]));
    state.currentVariant = match || null;
    el.price.textContent = state.currentVariant ? formatMoney(state.currentVariant.price) : 'Unavailable';
    el.addBtn.disabled = !state.currentVariant || !state.currentVariant.available;
  }

  /** close modal */
  function closeModal(){ modalRoot.classList.remove('ee-state--open'); }

  el.closeBtns.forEach(btn => btn.addEventListener('click', closeModal));
  el.backdrop.addEventListener('click', (e)=>{ if(e.target === el.backdrop) closeModal(); });

  /** open by hotspot click (event delegation) */
  document.addEventListener('click', (e)=>{
    const trigger = e.target.closest('[data-ee-open-modal]');
    if(!trigger) return;
    const script = trigger.parentElement.querySelector('.ee-product-data');
    if(!script) return;
    try {
      const product = JSON.parse(script.textContent.trim());
      openModal(product);
    } catch(err){}
  });

  /** add to cart */
  el.addBtn.addEventListener('click', async ()=>{
    if(!state.currentVariant) return;
    el.addBtn.disabled = true;

    try {
      // 1) add selected variant
      await addItems([{ id: state.currentVariant.id, quantity: parseInt(el.qty.value || 1, 10), properties: { _added_via: 'Grid Modal' } }]);

      // 2) if selected options contain Black AND Medium → also add Soft Winter Jacket
      const selectedVals = $$('.ee-select', el.options).map(s => s.value.toLowerCase());
      const hasBlack = selectedVals.includes('black');
      const hasMedium = selectedVals.includes('medium');

      if (hasBlack && hasMedium && state.addonProduct && state.addonProduct.variants && state.addonProduct.variants.length){
        // choose first available variant of the addon product
        const addonVariant = state.addonProduct.variants.find(v => v.available) || state.addonProduct.variants[0];
        await addItems([{ id: addonVariant.id, quantity: 1, properties: { _auto_added: 'Soft Winter Jacket' } }]);
      }

      // small UX: close modal & optionally show cart drawer if the theme has it
      closeModal();
      if (window.Shopify && Shopify.theme && window.theme && window.theme.openCartDrawer) {
        window.theme.openCartDrawer(); // Dawn has a drawer opener in many versions
      }
      alert('Added to cart');
    } catch(err){
      console.error(err);
      alert('Could not add to cart. Please try again.');
    } finally {
      el.addBtn.disabled = false;
    }
  });

  /** POST /cart/add.js for one or multiple items */
  async function addItems(items){
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ items })
    });
    if(!res.ok) throw new Error('Cart add failed');
    return res.json();
  }
})();