(function() {
  const modal = document.getElementById('manualImportModal');
  if (!modal) return;
  const openers = document.querySelectorAll('[data-manual-import-open]');
  const closers = modal.querySelectorAll('[data-manual-import-close]');
  const form = document.getElementById('manualImportForm');
  const msgEl = document.getElementById('manualImportMsg');
  const submitBtn = document.getElementById('manualImportSubmit');
  const instanceAddBtn = document.getElementById('manualAddInstance');
  const instancePicker = document.getElementById('manualInstancePicker');
  const instanceList = document.getElementById('instanceDescList');
  const instanceEntries = [];

  function setMsg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    if (isError) msgEl.classList.add('error');
    else msgEl.classList.remove('error');
  }

  function openModal() {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setMsg('');
  }

  openers.forEach((btn) => btn.addEventListener('click', openModal));
  closers.forEach((btn) => btn.addEventListener('click', closeModal));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  function refreshInstanceLabels() {
    instanceEntries.forEach((entry, idx) => {
      entry.nameEl.textContent = `实例 ${idx + 1}: ${entry.file.name}`;
    });
  }

  function clearInstanceEntries() {
    instanceEntries.splice(0, instanceEntries.length);
    if (instanceList) instanceList.innerHTML = '';
  }

  function addInstanceFiles(files) {
    if (!instanceList) return;
    if (!files || !files.length) return;
    Array.from(files).forEach((file, idx) => {
      const row = document.createElement('div');
      row.className = 'file-desc-item';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = `实例 ${instanceEntries.length + idx + 1}: ${file.name}`;
      const label = document.createElement('label');
      label.textContent = '实例介绍';
      const input = document.createElement('textarea');
      input.setAttribute('data-instance-desc', '1');
      input.rows = 2;
      const picLabel = document.createElement('label');
      picLabel.textContent = '实例图片 (多选)';
      const picInput = document.createElement('input');
      picInput.type = 'file';
      picInput.accept = 'image/*';
      picInput.multiple = true;
      picInput.setAttribute('data-instance-pics', '1');
      const actions = document.createElement('div');
      actions.className = 'file-desc-actions';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'manual-btn danger';
      removeBtn.textContent = '移除';
      removeBtn.addEventListener('click', () => {
        const index = instanceEntries.findIndex((entry) => entry.row === row);
        if (index >= 0) {
          instanceEntries.splice(index, 1);
        }
        row.remove();
        refreshInstanceLabels();
      });
      actions.appendChild(removeBtn);
      row.appendChild(name);
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(picLabel);
      row.appendChild(picInput);
      row.appendChild(actions);
      instanceList.appendChild(row);
      instanceEntries.push({ file, nameEl: name, descEl: input, picEl: picInput, row });
    });
    refreshInstanceLabels();
  }

  if (instanceAddBtn && instancePicker) {
    instanceAddBtn.addEventListener('click', () => {
      instancePicker.click();
    });
    instancePicker.addEventListener('change', () => {
      addInstanceFiles(instancePicker.files);
      instancePicker.value = '';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const formData = new FormData();
      const titleInput = form.querySelector('[name="title"]');
      const modelLinkInput = form.querySelector('[name="modelLink"]');
      const sourceLinkInput = form.querySelector('[name="sourceLink"]');
      const summaryInput = form.querySelector('[name="summary"]');
      const tagsInput = form.querySelector('[name="tags"]');
      formData.append('title', titleInput ? titleInput.value : '');
      formData.append('modelLink', modelLinkInput ? modelLinkInput.value : '');
      formData.append('sourceLink', sourceLinkInput ? sourceLinkInput.value : '');
      formData.append('summary', summaryInput ? summaryInput.value : '');
      formData.append('tags', tagsInput ? tagsInput.value : '');

      const coverInput = form.querySelector('[name="cover"]');
      if (coverInput && coverInput.files && coverInput.files[0]) {
        formData.append('cover', coverInput.files[0]);
      }
      const designInput = form.querySelector('[name="design_images"]');
      if (designInput && designInput.files) {
        Array.from(designInput.files).forEach((file) => formData.append('design_images', file));
      }
      instanceEntries.forEach((entry) => formData.append('instance_files', entry.file));
      const attachmentsInput = form.querySelector('[name="attachments"]');
      if (attachmentsInput && attachmentsInput.files) {
        Array.from(attachmentsInput.files).forEach((file) => formData.append('attachments', file));
      }
      const descs = instanceEntries.map((entry) => entry.descEl.value || '');
      const picInputs = instanceEntries.map((entry) => entry.picEl);
      const picCounts = [];
      const picFiles = [];
      picInputs.forEach((input) => {
        const files = input.files ? Array.from(input.files) : [];
        picCounts.push(files.length);
        files.forEach((file) => picFiles.push(file));
      });
      formData.append('instance_descs', JSON.stringify(descs));
      formData.append('instance_picture_counts', JSON.stringify(picCounts));
      picFiles.forEach((file) => formData.append('instance_pictures', file));

      if (submitBtn) submitBtn.disabled = true;
      setMsg('上传中...');
      try {
        const res = await fetch('/api/models/manual', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || '导入失败');
        }
        const data = await res.json();
        form.reset();
        clearInstanceEntries();
        setMsg('导入成功');
        closeModal();
        alert(`导入完成：${data.work_dir || data.base_name || ''}`);
        window.location.reload();
      } catch (err) {
        setMsg(`导入失败：${err.message || err}`, true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
})();
