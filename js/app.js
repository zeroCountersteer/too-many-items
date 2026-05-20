
const rows = document.getElementById('rows');

const demo = Array.from({length:40}).map((_,i)=>({
  part:`10k 1% 0603 #${i+1}`,
  category:'resistor',
  pkg:'0603',
  qty:Math.floor(Math.random()*500),
  location:'GDK'
}));

rows.innerHTML = demo.map(item=>`
<tr>
<td>${item.part}</td>
<td>${item.category}</td>
<td>${item.pkg}</td>
<td>${item.qty}</td>
<td>${item.location}</td>
<td><button>edit</button></td>
</tr>
`).join('');
