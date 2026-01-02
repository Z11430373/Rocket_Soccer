function createVehicle(pos, color, isAI) {
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.4, 2.2));
    const chassisBody = new CANNON.Body({ mass: CONFIG.carMass, material: CONFIG.mats.body });
    chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.5, 0)); chassisBody.position.copy(pos);
    if(isAI) chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI);
    chassisBody.angularDamping = 0.5; chassisBody.linearDamping = 0.15;
    const vehicle = new CANNON.RaycastVehicle({ chassisBody: chassisBody, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const wheelOpts = { radius: 0.55, directionLocal: new CANNON.Vec3(0, -1, 0), suspensionStiffness: 60, suspensionRestLength: 0.7, frictionSlip: 10.0, dampingRelaxation: 2.5, dampingCompression: 4.5, maxSuspensionForce: 100000, rollInfluence: 0.1, axleLocal: new CANNON.Vec3(-1, 0, 0), chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0), customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true };
    const wX = 0.95, wY = 0.5, wZ = 1.4;
    wheelOpts.chassisConnectionPointLocal.set(wX, wY, -wZ); vehicle.addWheel(wheelOpts);
    wheelOpts.chassisConnectionPointLocal.set(-wX, wY, -wZ); vehicle.addWheel(wheelOpts);
    wheelOpts.chassisConnectionPointLocal.set(wX, wY, wZ); vehicle.addWheel(wheelOpts);
    wheelOpts.chassisConnectionPointLocal.set(-wX, wY, wZ); vehicle.addWheel(wheelOpts);
    vehicle.addToWorld(world);
    const meshGroup = new THREE.Group();
    const carGeo = new THREE.BoxGeometry(2.0, 0.7, 4.4); const carMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.7 }); const carMesh = new THREE.Mesh(carGeo, carMat); carMesh.position.y = 0.6; carMesh.castShadow = true; meshGroup.add(carMesh);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.2), new THREE.MeshStandardMaterial({ color: 0x111 })); cabin.position.set(0, 1.25, -0.3); cabin.castShadow = true; meshGroup.add(cabin);
    const booster = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffaa00 })); booster.position.set(0, 0.6, 2.3); booster.visible = false; meshGroup.add(booster);
    const headLightContainer = new THREE.Group();
    const hlL = new THREE.SpotLight(0xffffff, 2.0, 60, 0.6, 0.5, 1); hlL.position.set(0.6, 0.6, -2.1); hlL.target.position.set(0.6, 0.0, -10.0); headLightContainer.add(hlL); headLightContainer.add(hlL.target);
    const bulbL = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })); bulbL.position.set(0.6, 0.6, -2.21); bulbL.rotation.y = Math.PI; headLightContainer.add(bulbL);
    const hlR = new THREE.SpotLight(0xffffff, 2.0, 60, 0.6, 0.5, 1); hlR.position.set(-0.6, 0.6, -2.1); hlR.target.position.set(-0.6, 0.0, -10.0); headLightContainer.add(hlR); headLightContainer.add(hlR.target);
    const bulbR = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })); bulbR.position.set(-0.6, 0.6, -2.21); bulbR.rotation.y = Math.PI; headLightContainer.add(bulbR);
    meshGroup.add(headLightContainer); scene.add(meshGroup);
    const wheelMeshes = [];
    const wGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24); wGeo.rotateZ(Math.PI/2); const wMat = new THREE.MeshStandardMaterial({ color: 0x222 });
    for(let i=0; i<4; i++) { const wm = new THREE.Mesh(wGeo, wMat); wm.castShadow = true; scene.add(wm); wheelMeshes.push(wm); const rim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.1), new THREE.MeshStandardMaterial({color:color})); rim.position.x = i%2===0 ? 0.26 : -0.26; wm.add(rim); }
    return { vehicle, chassisBody, mesh: meshGroup, booster, wheelMeshes, isAI, canJump: true };
}

function applyControl(carObj, throttle, steerInput, isBoost, isJump, dt = 1/60, isPlayer = false) {
    const v = carObj.vehicle; const b = carObj.chassisBody;
    const steer = steerInput * 0.6;
    v.setSteeringValue(steer, 0); v.setSteeringValue(steer, 1);

    let force = throttle * CONFIG.enginePower;
    let isBoostingNow = false;

    if (isPlayer) {
        const localVel = b.quaternion.inverse().vmult(b.velocity); const speedForward = -localVel.z; 
        if (isBoost && throttle > 0 && gameState.p1Boost > 0) {
            force *= CONFIG.boostMulti; isBoostingNow = true; gameState.p1Boost = Math.max(0, gameState.p1Boost - CONFIG.boostConsumption * dt);
        } else {
            if (throttle > 0 && speedForward > CONFIG.baseSpeedLimit) force = 0;
            else if (throttle < 0 && speedForward < -CONFIG.baseSpeedLimit) force = 0;
        }
    } else {
        if (isBoost) force *= CONFIG.boostMulti;
    }

    if (Math.abs(throttle) < 0.1) { for(let i=0; i<4; i++) { v.setBrake(20, i); v.applyEngineForce(0, i); } } 
    else { for(let i=0; i<4; i++) { v.setBrake(0, i); v.applyEngineForce(force, i); } }

    if(carObj.booster && CONFIG.vfxEnabled) {
        const currentSpeed = b.velocity.length(); const isGasActive = (throttle > 0 && currentSpeed < CONFIG.baseSpeedLimit);
        carObj.booster.visible = isBoostingNow || isGasActive;
        if(carObj.booster.visible) { const scale = isBoostingNow ? (Math.random()*0.5 + 1.2) : (Math.random()*0.2 + 0.8); carObj.booster.scale.setScalar(scale); }
    }

    if(isJump && carObj.canJump) {
        let onGround = false; for(let i=0; i<v.wheelInfos.length; i++) { if(v.wheelInfos[i].raycastResult.numHits > 0) onGround = true; }
        if(!onGround && b.position.y < 1.5) { const up = new CANNON.Vec3(0,1,0); const localUp = new CANNON.Vec3(0,1,0); b.quaternion.vmult(localUp, localUp); if(localUp.y > 0.8) onGround = true; }
        if(onGround) { b.applyImpulse(new CANNON.Vec3(0, CONFIG.jumpImpulse, 0), b.position); carObj.canJump = false; setTimeout(()=>carObj.canJump=true, 800); } 
        else { const up = new CANNON.Vec3(0,1,0); b.quaternion.vmult(up, up); if(up.y < 0.5) { b.torque.x += 6000; b.torque.z += 6000; } }
    }
}

function setupInputs() {
    const keys = {}; const hintEl = document.getElementById('controls-hint'); let hintFadeTimeout;
    const fadeHintLater = () => { clearTimeout(hintFadeTimeout); hintFadeTimeout = setTimeout(() => { let anyPressed = keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']; if (!anyPressed && !gameState.isTyping) hintEl.classList.remove('faded'); }, 1000); };
    document.addEventListener('keydown', e => { keys[e.code] = true; if (['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) { gameState.isTyping = true; hintEl.classList.add('faded'); clearTimeout(hintFadeTimeout); } });
    document.addEventListener('keyup', e => { keys[e.code] = false; let anyPressed = keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']; if (!anyPressed) { gameState.isTyping = false; fadeHintLater(); } });

    const touchZone = document.getElementById('touch-zone-left'); const joyBase = document.getElementById('joystick-base'); const joyThumb = document.getElementById('joystick-thumb');
    let joyId = null, startX=0, startY=0;
    touchZone.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; joyId = t.identifier; startX = t.clientX; startY = t.clientY; joyBase.style.display = 'block'; joyBase.style.left = (startX-60)+'px'; joyBase.style.top = (startY-60)+'px'; }, {passive:false});
    touchZone.addEventListener('touchmove', e => { e.preventDefault(); for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === joyId) { let t = e.changedTouches[i]; let dx = t.clientX - startX; let dy = t.clientY - startY; const maxDist = 60; const dist = Math.sqrt(dx*dx + dy*dy); if(dist > maxDist) { const ratio = maxDist / dist; dx *= ratio; dy *= ratio; } joyThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; inputState.joySteer = -(dx / 60); inputState.joyThrottle = -(dy / 60); } } }, {passive:false});
    touchZone.addEventListener('touchend', e => { e.preventDefault(); joyId = null; joyBase.style.display = 'none'; inputState.joySteer = 0; inputState.joyThrottle = 0; });

    const bindBtn = (id, prop) => { const b = document.getElementById(id); b.addEventListener('touchstart', (e)=>{e.preventDefault(); inputState[prop]=true; b.style.transform='scale(0.9)';}, {passive:false}); b.addEventListener('touchend', (e)=>{e.preventDefault(); inputState[prop]=false; b.style.transform='scale(1)';}); };
    bindBtn('btn-gas', 'boostBtn'); bindBtn('btn-jump', 'touchJump');

    inputState.update = () => {
        let th = 0, st = 0;
        if(keys['KeyW']) th = 1; if(keys['KeyS']) th = -1; if(keys['KeyA']) st = 1; if(keys['KeyD']) st = -1;
        inputState.throttle = th; inputState.steerKey = st; inputState.boost = keys['ShiftLeft']; inputState.jump = keys['Space'] || inputState.touchJump;
        if(document.body.classList.contains('touch-active')) {
            if (Math.abs(inputState.joyThrottle) > 0.1) inputState.throttle = inputState.joyThrottle;
            if (Math.abs(inputState.joySteer) > 0.1) inputState.steerKey = inputState.joySteer;
            inputState.boost = inputState.boostBtn;
        }
    };
}