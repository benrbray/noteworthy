async function render(){
	let appElt = document.querySelector(".app");
	if(!appElt) return;
	appElt.textContent = "Hello, Electron!";
}

export default render;