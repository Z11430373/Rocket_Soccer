// 全域變數
const CONFIG = {
    worldGravity: -30, carMass: 200, ballMass: 30, enginePower: 2000, jumpImpulse: 3900, 
    camHeight: 10.5, camDist: 10, fovSens: 1.3, boostMulti: 2.5, vfxEnabled: true,
    baseSpeedLimit: 28, boostConsumption: 40, boostRegen: 3
};
const SETTINGS = { ground: 'tech', hud: 'tech', vfx: 'on', ball: 'standard', control: 'keyboard' };
const VERSION_DATA = [
    { ver: "v18.015 Beta", desc: "AI 智能大升級：\n實作 driveTo 高階導航\n新增物理預判與自動跳躍\n優化攻防切換邏輯" },
    { ver: "v18.014.2 Beta", desc: "登入按鈕 Fail-Safe 機制" },
    { ver: "v18.014.1 Beta", desc: "緊急修復物理運算" }
];

let scene, camera, renderer, world, clock, playerCar, aiCar, ball, groundMesh; 
let isGoalScored = false, particles = [], isGameRunning = false; 
let playerData = { totalWins: 0, totalGoals: 0, level: 1, isMock: false };
const gameState = { scoreP1: 0, scoreAI: 0, gameTime: 0, isTyping: false, p1Boost: 100 };
const inputState = { throttle: 0, steer: 0, jump: false, touchJump: false, boost: false, boostBtn: false };

// Google API
const GOOGLE_CLIENT_ID = '801723208112-qnqkqssaavf3k7gv4r2ai1cgbt11pd4n.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
let tokenClient = null, accessToken = null, isGoogleReady = false;

window.onload = function() {
    const logList = document.getElementById('changelog-list');
    if (logList) {
        VERSION_DATA.forEach(v => { logList.innerHTML += `<div class="version-item"><div class="ver-tag">${v.ver}</div><div class="ver-desc">${v.desc}</div></div>`; });
    }
    
    setupSettings(); 
    setTimeout(checkGoogleLibrary, 500);

    document.getElementById('btn-confirm-settings').onclick = () => { document.getElementById('settings-modal').style.display = 'none'; };
    if(/Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 800) { document.querySelector('#opt-control [data-val="touch"]').click(); }
    document.getElementById('btn-fullscreen').onclick = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else if (document.exitFullscreen) document.exitFullscreen();
    };
};

function checkGoogleLibrary() {
    const indicator = document.getElementById('api-indicator');
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        isGoogleReady = true;
        if(indicator) indicator.className = 'api-status ready';
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID, scope: GOOGLE_SCOPES, ux_mode: 'popup',
                callback: (resp) => {
                    if (resp.error) {
                        if (resp.error === 'access_denied' || resp.error === 'invalid_request') {
                            alert("網域未授權，切換至模擬存檔模式。"); enableMockLogin();
                        } return;
                    }
                    accessToken = resp.access_token; updateLoginUI(true); loadGameFromDrive();
                },
            });
            console.log("Token Client Ready");
        } catch(e) { if(indicator) indicator.className = 'api-status error'; }
    } else {
        if(indicator) indicator.className = 'api-status'; setTimeout(checkGoogleLibrary, 1000);
    }
}

function enableMockLogin() {
    playerData.isMock = true;
    const saved = localStorage.getItem('rs_mock_save');
    if (saved) { playerData = JSON.parse(saved); playerData.isMock = true; }
    updateLoginUI(true);
    const badge = document.getElementById('save-status');
    if (badge) {
        badge.innerText = '本機模擬'; badge.style.background = '#888';
    }
    const indicator = document.getElementById('api-indicator');
    if(indicator) indicator.className = 'api-status offline';
}

window.handleAuthClick = function() {
    if (playerData.isMock) { alert("目前處於模擬模式 (Local Storage)。"); return; }
    if (!isGoogleReady || !tokenClient) { alert("Google 服務未就緒。切換至模擬模式..."); enableMockLogin(); return; }
    if (accessToken) { saveGameToDrive(); } else { try { tokenClient.requestAccessToken(); } catch(e) { alert("無法開啟視窗，切換至模擬模式。"); enableMockLogin(); } }
}

function updateLoginUI(isLoggedIn) {
    if (isLoggedIn) {
        document.getElementById('google-btn-text').innerText = `歡迎回來! Lv.${playerData.level}`;
        const badge = document.getElementById('save-status'); badge.innerText = '已連線'; badge.style.background = '#4285F4';
    }
}

async function saveGameToDrive() {
    if (playerData.isMock) {
        localStorage.setItem('rs_mock_save', JSON.stringify(playerData));
        const badge = document.getElementById('save-status'); badge.innerText = '已儲存'; setTimeout(() => badge.innerText = '本機模擬', 2000); return;
    }
    if (!accessToken) return;
    const statusBadge = document.getElementById('save-status'); statusBadge.innerText = '儲存中...';
    if (!gapi.client.drive) { await new Promise((resolve) => gapi.load('client', resolve)); await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] }); }
    try {
        const fileName = 'rs_save.json'; const fileContent = JSON.stringify(playerData);
        const response = await gapi.client.drive.files.list({ q: `name = '${fileName}' and 'appDataFolder' in parents`, fields: 'files(id, name)', spaces: 'appDataFolder' });
        const files = response.result.files;
        if (files && files.length > 0) {
            await gapi.client.request({ path: '/upload/drive/v3/files/' + files[0].id, method: 'PATCH', params: { uploadType: 'media' }, body: fileContent });
        } else {
            const metadata = { 'name': fileName, 'mimeType': 'application/json', 'parents': ['appDataFolder'] };
            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n"; const close_delim = "\r\n--" + boundary + "--";
            const multipartRequestBody = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) + delimiter + 'Content-Type: application/json\r\n\r\n' + fileContent + close_delim;
            await gapi.client.request({ 'path': '/upload/drive/v3/files', 'method': 'POST', 'params': {'uploadType': 'multipart'}, 'headers': { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, 'body': multipartRequestBody });
        }
        statusBadge.innerText = '同步完成'; setTimeout(() => statusBadge.innerText = '已連線', 2000);
    } catch (err) { statusBadge.innerText = '儲存失敗'; statusBadge.style.background = '#ff3333'; }
}

async function loadGameFromDrive() {
    if (!accessToken) return;
    const statusBadge = document.getElementById('save-status'); statusBadge.innerText = '讀取中...';
    if (!gapi.client.drive) { await new Promise((resolve) => gapi.load('client', resolve)); await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] }); }
    try {
        const response = await gapi.client.drive.files.list({ q: `name = 'rs_save.json' and 'appDataFolder' in parents`, fields: 'files(id, name)', spaces: 'appDataFolder' });
        const files = response.result.files;
        if (files && files.length > 0) {
            const file = await gapi.client.drive.files.get({ fileId: files[0].id, alt: 'media' });
            playerData = file.result; updateLoginUI(true); statusBadge.innerText = '已同步';
        } else { statusBadge.innerText = '新遊戲'; }
    } catch (err) { statusBadge.innerText = '讀取失敗'; }
}

function updatePhysics(dt) {
    if(!playerCar || !aiCar) return;
    inputState.update();
    gameState.gameTime += dt;
    
    if (!inputState.boost && gameState.p1Boost < 100) {
        gameState.p1Boost = Math.min(100, gameState.p1Boost + CONFIG.boostRegen * dt);
    }

    if (typeof applyControl === 'function') {
        applyControl(playerCar, inputState.throttle, inputState.steerKey, inputState.boost, inputState.jump, dt, true);
    }
    
    // Pass dt to updateAI
    if (typeof updateAI === 'function') {
        updateAI(dt);
    }

    checkReset(playerCar.chassisBody, 0, 3, 30);
    
    const aiPos = aiCar.chassisBody.position;
    if (Math.abs(aiPos.x) > 58 || Math.abs(aiPos.z) > 88) {
        const correction = new CANNON.Vec3(-aiPos.x * 0.1, 0, -aiPos.z * 0.1);
        aiCar.chassisBody.applyImpulse(correction, aiPos);
    }
    checkReset(aiCar.chassisBody, 0, 3, -30, Math.PI);
    checkReset(ball.body, 0, 10, 0);
    checkGoals();
}

function checkReset(body, x, y, z, rot=0) {
    if(body.position.y < -5 || Math.abs(body.position.z) > 130) {
        body.position.set(x, y, z); body.velocity.set(0,0,0); body.angularVelocity.set(0,0,0); body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), rot);
    }
}

function showGoalEffect(text, color, goalPos) {
    const overlay = document.getElementById('goal-overlay'); const txt = document.getElementById('goal-text');
    txt.innerText = text; txt.style.color = color; overlay.style.opacity = 1;
    txt.classList.remove('goal-anim'); void txt.offsetWidth; txt.classList.add('goal-anim');
    createExplosion(goalPos, color); setTimeout(() => { overlay.style.opacity = 0; }, 2000);
}

function animateScore(boxId, colorClass, newScore) {
    const box = document.getElementById(boxId); const oldDigit = box.querySelector('.score-digit');
    if(oldDigit) { oldDigit.classList.add('slide-out-up'); setTimeout(() => oldDigit.remove(), 500); }
    const newDigit = document.createElement('div'); newDigit.className = `score-digit ${colorClass} slide-in-up`; newDigit.innerText = newScore; box.appendChild(newDigit);
}

function checkGoals() {
    if (isGoalScored) return; 
    if(Math.abs(ball.body.position.x) < 15) {
        if(ball.body.position.z > 90) { 
            gameState.scoreAI++; animateScore('score-cpu-box', 'cpu-color', gameState.scoreAI); showGoalEffect("AI SCORED!", "#1e90ff", new THREE.Vector3(0, 5, 93));
            playerData.totalGoals++; playerData.level = Math.floor(playerData.totalGoals / 5) + 1; saveGameToDrive(); handleGoal();
        }
        else if(ball.body.position.z < -90) { 
            gameState.scoreP1++; animateScore('score-p1-box', 'p1-color', gameState.scoreP1); showGoalEffect("YOU SCORED!", "#ff4757", new THREE.Vector3(0, 5, -93));
            playerData.totalWins++; playerData.totalGoals++; playerData.level = Math.floor(playerData.totalGoals / 5) + 1; saveGameToDrive(); handleGoal();
        }
    }
}

function handleGoal() { isGoalScored = true; setTimeout(resetRound, 2000); }
function resetRound() {
    isGoalScored = false; ball.body.position.set(0, 10, 0); ball.body.velocity.set(0,0,0); ball.body.angularVelocity.set(0,0,0);
    checkReset(playerCar.chassisBody, 0, 3, 30); checkReset(aiCar.chassisBody, 0, 3, -30, Math.PI); gameState.p1Boost = 100;
}

function updateLabels() {
    if(!playerCar) return;
    const up = (body, id) => {
        const el = document.getElementById(id); const pos = new THREE.Vector3(body.position.x, body.position.y+2, body.position.z); pos.project(camera);
        if(pos.z < 1) { const x = (pos.x * .5 + .5) * window.innerWidth; const y = (-pos.y * .5 + .5) * window.innerHeight; el.style.display = 'block'; el.style.left = x+'px'; el.style.top = y+'px'; } else el.style.display = 'none';
    };
    if(playerCar) up(playerCar.chassisBody, 'p1-label'); if(aiCar) up(aiCar.chassisBody, 'cpu-label');
    if(playerCar) {
        document.getElementById('speed-val').innerText = Math.round(playerCar.chassisBody.velocity.length() * 3.6);
        document.getElementById('boost-bar').style.transform = `scaleX(${gameState.p1Boost / 100})`;
    }
}

function createExplosion(pos, colorHex) {
    if (!CONFIG.vfxEnabled) return;
    const particleCount = 80; const geometry = new THREE.BufferGeometry(); const positions = []; const velocities = []; const colors = []; const baseColor = new THREE.Color(colorHex);
    for (let i = 0; i < particleCount; i++) {
        positions.push(pos.x, pos.y, pos.z); const theta = Math.random() * Math.PI * 2; const phi = Math.random() * Math.PI * 0.8; const speed = Math.random() * 25 + 10;
        velocities.push(speed * Math.sin(phi) * Math.cos(theta), speed * Math.cos(phi) + 10, speed * Math.sin(phi) * Math.sin(theta)); colors.push(baseColor.r, baseColor.g, baseColor.b);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    const ps = new THREE.Points(geometry, material); scene.add(ps); particles.push({ mesh: ps, vels: velocities, life: 1.2 });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.life -= dt; 
        if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); particles.splice(i, 1); continue; }
        const positions = p.mesh.geometry.attributes.position.array;
        for (let j = 0; j < p.vels.length; j += 3) {
            positions[j] += p.vels[j] * dt; positions[j+1] += p.vels[j+1] * dt; positions[j+2] += p.vels[j+2] * dt;
            p.vels[j+1] -= 50 * dt; if (positions[j+1] < 0) { positions[j+1] = 0; p.vels[j+1] *= -0.5; }
        }
        p.mesh.geometry.attributes.position.needsUpdate = true; p.mesh.material.opacity = Math.max(0, p.life); p.mesh.scale.setScalar(1 + (1.2 - p.life));
    }
}

function animate() {
    requestAnimationFrame(animate);
    if(!isGameRunning) return; 

    const dt = Math.min(clock.getDelta(), 0.1);
    world.step(1/60, dt, 10);
    
    updatePhysics(dt);
    updateParticles(dt); 
    
    const sync = (o) => {
        o.mesh.position.copy(o.chassisBody.position); o.mesh.quaternion.copy(o.chassisBody.quaternion);
        for(let i=0; i<4; i++) {
            o.vehicle.updateWheelTransform(i);
            o.wheelMeshes[i].position.copy(o.vehicle.wheelInfos[i].worldTransform.position);
            o.wheelMeshes[i].quaternion.copy(o.vehicle.wheelInfos[i].worldTransform.quaternion);
        }
    };
    if(playerCar) sync(playerCar); if(aiCar) sync(aiCar);
    ball.mesh.position.copy(ball.body.position); ball.mesh.quaternion.copy(ball.body.quaternion);

    if(playerCar) {
        const p = playerCar.chassisBody.position;
        const q = playerCar.chassisBody.quaternion;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        forward.y = 0; if (forward.lengthSq() > 0.01) forward.normalize(); else forward.set(0,0,-1);

        const speedKmh = playerCar.chassisBody.velocity.length() * 3.6;
        const targetFov = 75 + Math.max(0, (speedKmh - 70) * CONFIG.fovSens); 
        camera.fov = THREE.MathUtils.lerp(camera.fov, Math.min(120, targetFov), 0.1);
        camera.updateProjectionMatrix();

        const targetPos = new THREE.Vector3().copy(p).sub(forward.clone().multiplyScalar(CONFIG.camDist)).add(new THREE.Vector3(0, CONFIG.camHeight, 0));
        camera.position.lerp(targetPos, 0.1);
        const lookTarget = new THREE.Vector3().copy(p).add(forward.multiplyScalar(20));
        camera.lookAt(lookTarget);
    }
    
    updateLabels();
    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}