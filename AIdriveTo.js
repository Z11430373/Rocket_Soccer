/**
 * driveTo - 高階導航函式
 * 負責將抽象的戰術目標轉換為底層的物理操作輸入。
 * * @param {Object} car - 賽車物件 (包含 pos, heading, velocity, steerInput 等)
 * @param {Vector3} targetPos - 目標位置 (x, y, z)
 * @param {Vector3} targetHeading - 到達目標時預期的車頭向量 (normalized)
 * @param {number} finalSpeed - 到達目標時的期望速度
 * @param {number} timeToArrival - 預計花費時間 (秒)，用於計算加速/減速
 * @param {number} dt - 物理偵增量時間
 */
function driveTo(car, targetPos, targetHeading, finalSpeed, timeToArrival, dt) {
    // 1. 計算位移向量與距離
    const toTarget = {
        x: targetPos.x - car.chassisBody.position.x,
        z: targetPos.z - car.chassisBody.position.z
    };
    const distance = Math.sqrt(toTarget.x ** 2 + toTarget.z ** 2);
    
    // 2. 計算所需的目標航向 (Desired Heading)
    // 如果距離還遠，優先指向目標點；如果接近目標，則過度到 targetHeading
    const distanceThreshold = 10.0; // 進入此距離開始校正車頭朝向
    let desiredDir = { x: 0, z: 0 };
    
    if (distance > 0.1) {
        if (distance > distanceThreshold) {
            // 遠距離：直接朝向目標點
            desiredDir = { x: toTarget.x / distance, z: toTarget.z / distance };
        } else {
            // 近距離：線性插值轉向期望的 targetHeading
            const lerpFactor = 1.0 - (distance / distanceThreshold);
            const toTargetNorm = { x: toTarget.x / distance, z: toTarget.z / distance };
            
            desiredDir.x = toTargetNorm.x * (1 - lerpFactor) + targetHeading.x * lerpFactor;
            desiredDir.z = toTargetNorm.z * (1 - lerpFactor) + targetHeading.z * lerpFactor;
            
            const finalMag = Math.sqrt(desiredDir.x ** 2 + desiredDir.z ** 2);
            if (finalMag > 0) {
                desiredDir.x /= finalMag;
                desiredDir.z /= finalMag;
            }
        }
    }

    // 3. 計算轉向輸入 (Steering)
    // 計算車頭向量 (World Space)
    const q = car.chassisBody.quaternion;
    const forward = new CANNON.Vec3(0, 0, -1);
    q.vmult(forward, forward);

    // 利用向量點積與外積
    const dot = forward.x * desiredDir.x + forward.z * desiredDir.z;
    const det = forward.x * desiredDir.z - forward.z * desiredDir.x; // 2D 外積
    
    let steerInput = Math.atan2(det, dot);
    // 正規化至 -1 ~ 1
    steerInput = Math.max(-1, Math.min(1, steerInput / 0.8));

    // 4. 計算油門與速度控制 (Throttle & Boost)
    const currentSpeed = car.chassisBody.velocity.length();
    let throttle = 0;
    let isBoost = false;

    // 簡單的梯形速度控制
    const requiredAvgSpeed = distance / Math.max(0.5, timeToArrival);
    // 目標速度取「所需速度」與「最終期望速度」的較大者
    const targetSpeed = Math.max(requiredAvgSpeed, finalSpeed);
    
    // 5. 特殊邏輯：倒車
    // 如果目標在正後方 (-dot) 且距離近，切換為倒車模式
    if (dot < -0.5 && distance < 10) {
        throttle = -1.0;
        steerInput = -steerInput; // 倒車時轉向反轉
    } else {
        if (currentSpeed < targetSpeed) {
            throttle = 1.0;
            // 如果差距過大且角度正確，開啟氮氣 (CONFIG 需要是全域變數)
            if (targetSpeed > (window.CONFIG ? window.CONFIG.baseSpeedLimit : 28) && Math.abs(steerInput) < 0.2) {
                isBoost = true;
            }
        } else if (currentSpeed > targetSpeed + 5.0) {
            throttle = -1.0; // 減速
        } else {
            throttle = 0.1; // 維持
        }
    }

    // 6. 輸出至底層控制
    // 注意：applyControl 必須在全域範圍內可用
    if (typeof applyControl === 'function') {
        applyControl(car, throttle, steerInput, isBoost, false, dt, false);
    }
}